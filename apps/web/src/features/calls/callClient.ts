import {
  TurnCredentialsResponse,
  type CallAcceptedEvent,
  type CallAck,
  type CallIncomingEvent,
  type CallInviteAck,
  type CallMedia,
  type CallEndedEvent,
  type RtcDescriptionEvent,
  type RtcIceCandidateEvent,
  type RtcDescriptionPayload,
  type RtcIceCandidatePayload,
  type IceCandidateType,
} from "@chatisen/shared";
import { ApiError } from "../../lib/errors";
import type { ApiClient } from "../../lib/api";
import type { ChatSocket } from "../../lib/socket";
import { transitionCallState, type CallFailure, type CallState } from "./callState";
import { CallQualityCollector } from "./quality";

export interface CallRuntime {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createPeerConnection(configuration: RTCConfiguration): RTCPeerConnection;
}

const browserRuntime: CallRuntime = {
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  createPeerConnection: (configuration) => new RTCPeerConnection(configuration),
};

export interface CallClientOptions {
  runtime?: CallRuntime;
  ackTimeoutMs?: number;
  api: ApiClient;
  socket: ChatSocket;
}

/** Pilote un appel WebRTC 1-1 ; la signalisation reste typée et autorisée par le serveur. */
export class CallClient {
  private stateValue: CallState = { status: "idle" };
  private readonly listeners = new Set<(state: CallState) => void>();
  private readonly runtime: CallRuntime;
  private readonly ackTimeoutMs: number;
  private readonly apiClient: ApiClient;
  private readonly socket: ChatSocket;
  private localValue: MediaStream | null = null;
  private remoteValue: MediaStream | null = null;
  private peer: RTCPeerConnection | null = null;
  private quality: CallQualityCollector | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private pendingAccepted: CallAcceptedEvent | null = null;
  private pendingEnded: CallEndedEvent | null = null;
  private disposed = false;

  constructor(options: CallClientOptions = {}) {
    this.runtime = options.runtime ?? browserRuntime;
    this.ackTimeoutMs = options.ackTimeoutMs ?? 10_000;
    this.apiClient = options.api;
    this.socket = options.socket;
    this.socket.on("call:incoming", this.onIncoming);
    this.socket.on("call:accepted", this.onAccepted);
    this.socket.on("call:ended", this.onEnded);
    this.socket.on("rtc:offer", this.onOffer);
    this.socket.on("rtc:answer", this.onAnswer);
    this.socket.on("rtc:ice-candidate", this.onCandidate);
  }

  get state(): CallState { return this.stateValue; }
  get localStream(): MediaStream | null { return this.localValue; }
  get remoteStream(): MediaStream | null { return this.remoteValue; }

  subscribe(listener: (state: CallState) => void): () => void {
    this.listeners.add(listener);
    listener(this.stateValue);
    return () => this.listeners.delete(listener);
  }

  /** Récupère des identifiants TURN temporaires avant chaque appel puis envoie l'invitation. */
  async start(conversationId: string, peerId: string, media: CallMedia): Promise<string> {
    if (this.stateValue.status !== "idle" && this.stateValue.status !== "ended") throw new Error("Un appel est déjà actif");
    this.dispatch({ type: "outgoing", conversationId, peerId, media });
    try {
      await this.prepareLocalMedia(media);
      const ack = await this.emitAck<CallInviteAck>("call:invite", { conversationId, media });
      this.assertAck(ack);
      this.dispatch({ type: "identified", callId: ack.data.callId });
      if (this.pendingEnded?.callId === ack.data.callId) {
        const ended = this.pendingEnded;
        this.pendingEnded = null;
        await this.cleanup();
        this.dispatch({ type: "ended", callId: ended.callId, reason: ended.reason });
      } else if (this.pendingAccepted?.callId === ack.data.callId) {
        this.pendingAccepted = null;
        await this.startOutgoingPeerConnection();
      }
      return ack.data.callId;
    } catch (err) {
      await this.fail(this.mapFailure(err));
      throw err;
    }
  }

  /** Accepte l'appel entrant après obtention des identifiants TURN et des médias locaux. */
  async accept(): Promise<void> {
    if (this.stateValue.status !== "incoming") throw new Error("Aucun appel entrant à accepter");
    const incoming = this.stateValue;
    try {
      await this.prepareLocalMedia(incoming.media);
      await this.createPeer(incoming.callId, incoming.peerId);
      this.dispatch({ type: "connecting" });
      const ack = await this.emitAck<{ callId: string }>("call:accept", { callId: incoming.callId });
      this.assertAck(ack);
    } catch (err) {
      await this.fail(this.mapFailure(err));
      throw err;
    }
  }

  async reject(): Promise<void> {
    if (this.stateValue.status !== "incoming") return;
    const callId = this.stateValue.callId;
    try {
      const ack = await this.emitAck<{ callId: string }>("call:reject", { callId });
      this.assertAck(ack);
    } finally {
      await this.cleanup();
      this.dispatch({ type: "ended", callId, reason: "rejected" });
    }
  }

  async hangup(): Promise<void> {
    const callId = "callId" in this.stateValue ? this.stateValue.callId : null;
    if (callId) {
      try {
        const ack = await this.emitAck<{ callId: string }>("call:hangup", { callId });
        this.assertAck(ack);
      } finally {
        await this.cleanup();
        this.dispatch({ type: "ended", callId, reason: "hangup" });
      }
    } else {
      await this.cleanup();
      this.dispatch({ type: "ended", callId: null, reason: "hangup" });
    }
  }

  /** Arrête les médias et retire tous les écouteurs ; à appeler au démontage de l'application. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.socket.off("call:incoming", this.onIncoming);
    this.socket.off("call:accepted", this.onAccepted);
    this.socket.off("call:ended", this.onEnded);
    this.socket.off("rtc:offer", this.onOffer);
    this.socket.off("rtc:answer", this.onAnswer);
    this.socket.off("rtc:ice-candidate", this.onCandidate);
    await this.cleanup();
    this.listeners.clear();
  }

  private dispatch(action: Parameters<typeof transitionCallState>[1]): void {
    this.stateValue = transitionCallState(this.stateValue, action);
    for (const listener of this.listeners) listener(this.stateValue);
  }

  private async prepareLocalMedia(media: CallMedia): Promise<void> {
    const credentials = await this.apiClient.request("GET", "/turn/credentials", TurnCredentialsResponse);
    this.localValue = await this.runtime.getUserMedia({ audio: true, video: media === "video" });
    this.notify();
    this.iceConfiguration = {
      iceServers: [{ urls: credentials.urls, username: credentials.username, credential: credentials.credential }],
    };
  }

  private iceConfiguration: RTCConfiguration = {};

  private async createPeer(callId: string, peerId: string): Promise<RTCPeerConnection> {
    if (this.peer) return this.peer;
    const pc = this.runtime.createPeerConnection(this.iceConfiguration);
    this.peer = pc;
    for (const track of this.localValue?.getTracks() ?? []) pc.addTrack(track, this.localValue!);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.updateCandidateType(event.candidate.candidate);
        const payload: RtcIceCandidatePayload = { callId, to: peerId, candidate: event.candidate.toJSON() };
        void this.emitAck<{ relayed: true }>("rtc:ice-candidate", payload).catch(() => undefined);
      }
    };
    pc.ontrack = (event) => {
      this.remoteValue = event.streams[0] ?? this.remoteValue;
      this.notify();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        this.dispatch({ type: "connected" });
        if (!this.quality) {
          this.quality = new CallQualityCollector(this.apiClient, callId, pc);
          this.quality.start();
        }
      }
      if (pc.connectionState === "failed") void this.fail("ice-failed");
    };
    return pc;
  }

  private async startOutgoingPeerConnection(): Promise<void> {
    if (this.stateValue.status !== "outgoing" || !this.stateValue.callId) return;
    const { callId, peerId } = this.stateValue;
    try {
      const pc = await this.createPeer(callId, peerId);
      this.dispatch({ type: "connecting" });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const payload: RtcDescriptionPayload = { callId, to: peerId, sdp: pc.localDescription?.sdp ?? offer.sdp ?? "" };
      this.assertAck(await this.emitAck<{ relayed: true }>("rtc:offer", payload));
    } catch {
      await this.fail("ice-failed");
    }
  }

  private readonly onIncoming = (event: CallIncomingEvent): void => {
    if (this.stateValue.status !== "idle" && this.stateValue.status !== "ended") return;
    this.pendingIce = [];
    this.dispatch({ type: "incoming", callId: event.callId, conversationId: event.conversationId, peerId: event.from, media: event.media });
  };

  private readonly onAccepted = (event: CallAcceptedEvent): void => {
    if (this.stateValue.status === "outgoing" && this.stateValue.callId === null) {
      this.pendingAccepted = event;
      return;
    }
    if (this.stateValue.status === "outgoing" && this.stateValue.callId === event.callId) {
      void this.startOutgoingPeerConnection();
    }
  };

  private readonly onEnded = (event: CallEndedEvent): void => {
    if (this.stateValue.status === "outgoing" && this.stateValue.callId === null) {
      this.pendingEnded = event;
      return;
    }
    if (!("callId" in this.stateValue) || this.stateValue.callId !== event.callId) return;
    void this.cleanup().then(() => this.dispatch({ type: "ended", callId: event.callId, reason: event.reason }));
  };

  private readonly onOffer = (event: RtcDescriptionEvent): void => {
    void this.receiveOffer(event);
  };

  private async receiveOffer(event: RtcDescriptionEvent): Promise<void> {
    if (this.stateValue.status !== "connecting" || this.stateValue.callId !== event.callId || !this.peer) return;
    try {
      await this.peer.setRemoteDescription({ type: "offer", sdp: event.sdp });
      await this.flushIce();
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      const payload: RtcDescriptionPayload = {
        callId: event.callId,
        to: event.from,
        sdp: this.peer.localDescription?.sdp ?? answer.sdp ?? "",
      };
      this.assertAck(await this.emitAck<{ relayed: true }>("rtc:answer", payload));
    } catch {
      await this.fail("ice-failed");
    }
  }

  private readonly onAnswer = (event: RtcDescriptionEvent): void => {
    void this.receiveAnswer(event);
  };

  private async receiveAnswer(event: RtcDescriptionEvent): Promise<void> {
    if (this.stateValue.status !== "connecting" || this.stateValue.callId !== event.callId || !this.peer) return;
    try {
      await this.peer.setRemoteDescription({ type: "answer", sdp: event.sdp });
      await this.flushIce();
    } catch {
      await this.fail("ice-failed");
    }
  }

  private readonly onCandidate = (event: RtcIceCandidateEvent): void => {
    if (!("callId" in this.stateValue) || this.stateValue.callId !== event.callId) return;
    if (!this.peer?.remoteDescription) {
      this.pendingIce.push(event.candidate);
      return;
    }
    void this.peer.addIceCandidate(event.candidate).catch(() => this.fail("ice-failed"));
  };

  private async flushIce(): Promise<void> {
    const candidates = this.pendingIce.splice(0);
    for (const candidate of candidates) await this.peer?.addIceCandidate(candidate);
  }

  private updateCandidateType(candidate: string): void {
    const match = / typ (host|srflx|relay|prflx)(?: |$)/.exec(candidate);
    if (!match) return;
    const candidateType: IceCandidateType = match[1] === "relay" ? "relay" : match[1] === "host" ? "host" : "srflx";
    this.dispatch({ type: "candidate", candidateType });
  }

  private async emitAck<T>(event: string, payload: unknown): Promise<CallAck<T>> {
    try {
      return (await this.socket.timeout(this.ackTimeoutMs).emitWithAck(event as never, payload as never)) as CallAck<T>;
    } catch {
      throw new ApiError("NETWORK_ERROR", undefined);
    }
  }

  private assertAck<T>(ack: CallAck<T>): asserts ack is { ok: true; data: T } {
    if (!ack.ok) throw new ApiError(ack.error.code, undefined, ack.error.message, ack.error.requestId);
  }

  private mapFailure(err: unknown): CallFailure {
    if (err instanceof ApiError && err.code === "NETWORK_ERROR") return "network";
    if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) return "permission-denied";
    if (err instanceof DOMException && (err.name === "NotFoundError" || err.name === "DevicesNotFoundError")) return "device-not-found";
    return "unknown";
  }

  private async fail(failure: CallFailure): Promise<void> {
    const callId = "callId" in this.stateValue ? this.stateValue.callId : null;
    if (callId) void this.emitAck<{ callId: string }>("call:hangup", { callId }).catch(() => undefined);
    await this.cleanup();
    this.dispatch({ type: "failed", callId, failure });
  }

  private async cleanup(): Promise<void> {
    await this.quality?.stop();
    this.quality = null;
    this.peer?.close();
    this.peer = null;
    for (const track of this.localValue?.getTracks() ?? []) track.stop();
    this.localValue = null;
    this.remoteValue = null;
    this.pendingIce = [];
    this.pendingAccepted = null;
    this.pendingEnded = null;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.stateValue);
  }
}
