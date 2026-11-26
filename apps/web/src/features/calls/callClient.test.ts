import { describe, expect, it, vi } from "vitest";
import type { CallAcceptedEvent, CallIncomingEvent, RtcDescriptionEvent, RtcIceCandidateEvent } from "@chatisen/shared";
import type { ApiClient } from "../../lib/api";
import type { ChatSocket } from "../../lib/socket";
import { CallClient, type CallRuntime } from "./callClient";

class FakeSocket {
  handlers = new Map<string, Set<(payload: never) => void>>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  on(event: string, listener: (payload: never) => void) {
    const listeners = this.handlers.get(event) ?? new Set();
    listeners.add(listener);
    this.handlers.set(event, listeners);
    return this;
  }
  off(event: string, listener: (payload: never) => void) {
    this.handlers.get(event)?.delete(listener);
    return this;
  }
  timeout() { return this; }
  async emitWithAck(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
    if (event === "call:invite") return { ok: true, data: { callId: "call-1" } };
    if (event === "rtc:offer" || event === "rtc:answer" || event === "rtc:ice-candidate") return { ok: true, data: { relayed: true } };
    return { ok: true, data: { callId: "call-1" } };
  }
  fire<T>(event: string, payload: T) {
    for (const listener of this.handlers.get(event) ?? []) listener(payload as never);
  }
}

function makePeer() {
  const peer = {
    connectionState: "new",
    localDescription: null as RTCSessionDescriptionInit | null,
    remoteDescription: null as RTCSessionDescriptionInit | null,
    addTrack: vi.fn(),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" })),
    createAnswer: vi.fn(async () => ({ type: "answer", sdp: "answer-sdp" })),
    setLocalDescription: vi.fn(async (description: RTCSessionDescriptionInit) => { peer.localDescription = description; }),
    setRemoteDescription: vi.fn(async (description: RTCSessionDescriptionInit) => { peer.remoteDescription = description; }),
    addIceCandidate: vi.fn(async () => undefined),
    close: vi.fn(),
    onicecandidate: null as ((event: RTCPeerConnectionIceEvent) => void) | null,
    ontrack: null as ((event: RTCTrackEvent) => void) | null,
    onconnectionstatechange: null as (() => void) | null,
  };
  return peer as unknown as RTCPeerConnection & typeof peer;
}

function harness() {
  const socket = new FakeSocket();
  const api = { request: vi.fn(async () => ({
    urls: ["turn:turn.example.test:3478"],
    username: "123:user",
    credential: "signature",
    ttl: 3600,
  })) };
  const track = { enabled: true, stop: vi.fn() };
  const videoTrack = { enabled: true, stop: vi.fn() };
  const stream = {
    getTracks: () => [track, videoTrack],
    getAudioTracks: () => [track],
    getVideoTracks: () => [videoTrack],
  } as unknown as MediaStream;
  const peer = makePeer();
  const runtime: CallRuntime = {
    getUserMedia: vi.fn(async () => stream),
    createPeerConnection: vi.fn(() => peer),
  };
  const client = new CallClient({
    api: api as unknown as ApiClient,
    socket: socket as unknown as ChatSocket,
    runtime,
    ackTimeoutMs: 100,
  });
  return { client, socket, api, runtime, peer, track, videoTrack, stream };
}

describe("CallClient WebRTC", () => {
  it("obtains TURN credentials before camera/microphone access and offers video after acceptance", async () => {
    const h = harness();
    const callId = await h.client.start("conversation-1", "peer-1", "video");
    expect(callId).toBe("call-1");
    expect(h.api.request).toHaveBeenCalledWith("GET", "/turn/credentials", expect.anything());
    expect(h.runtime.getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(h.runtime.createPeerConnection).not.toHaveBeenCalled();
    expect(h.client.state.status).toBe("outgoing");

    h.socket.fire<CallAcceptedEvent>("call:accepted", { callId, userId: "peer-1" });
    await vi.waitFor(() => expect(h.peer.createOffer).toHaveBeenCalledOnce());
    expect(h.runtime.createPeerConnection).toHaveBeenCalledWith({
      iceServers: [{ urls: ["turn:turn.example.test:3478"], username: "123:user", credential: "signature" }],
    });
    expect(h.socket.emitted.some((e) => e.event === "rtc:offer" && (e.payload as { sdp: string }).sdp === "offer-sdp")).toBe(true);
    expect(h.client.state.status).toBe("connecting");

    h.peer.connectionState = "connected";
    h.peer.onconnectionstatechange?.(new Event("connectionstatechange"));
    expect(h.client.state.status).toBe("connected");
    const offersBeforeMute = h.socket.emitted.filter((e) => e.event === "rtc:offer").length;
    expect(h.client.setMicrophoneEnabled(false)).toBe(true);
    expect(h.client.setCameraEnabled(false)).toBe(true);
    expect(h.client.microphoneEnabled).toBe(false);
    expect(h.client.cameraEnabled).toBe(false);
    expect(h.socket.emitted.filter((e) => e.event === "rtc:offer")).toHaveLength(offersBeforeMute);
    expect(h.socket.emitted.some((e) => e.event === "call:media-state" && (e.payload as { cameraEnabled: boolean }).cameraEnabled === false)).toBe(true);
    h.socket.fire("call:media-state", { callId, from: "peer-1", cameraEnabled: false });
    expect(h.client.remoteCameraEnabled).toBe(false);
    await h.client.hangup();
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.videoTrack.stop).toHaveBeenCalledOnce();
    expect(h.peer.close).toHaveBeenCalledOnce();
    expect(h.client.state).toMatchObject({ status: "ended", reason: "hangup" });
  });

  it("queues ICE candidates received before the remote SDP and answers an incoming call", async () => {
    const h = harness();
    h.socket.fire<CallIncomingEvent>("call:incoming", {
      callId: "call-1", conversationId: "conversation-1", from: "caller", media: "audio",
    });
    expect(h.client.state.status).toBe("incoming");
    await h.client.accept();
    expect(h.runtime.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });

    const candidate: RtcIceCandidateEvent = {
      callId: "call-1", from: "caller", candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 },
    };
    h.socket.fire("rtc:ice-candidate", candidate);
    expect(h.peer.addIceCandidate).not.toHaveBeenCalled();

    const offer: RtcDescriptionEvent = { callId: "call-1", from: "caller", sdp: "offer-sdp" };
    h.socket.fire("rtc:offer", offer);
    await vi.waitFor(() => expect(h.peer.createAnswer).toHaveBeenCalledOnce());
    expect(h.peer.setRemoteDescription).toHaveBeenCalledWith({ type: "offer", sdp: "offer-sdp" });
    expect(h.peer.addIceCandidate).toHaveBeenCalledWith(candidate.candidate);
    expect(h.socket.emitted.some((e) => e.event === "rtc:answer")).toBe(true);
  });

  it("surfaces permission denial and stops any acquired media", async () => {
    const h = harness();
    vi.mocked(h.runtime.getUserMedia).mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    await expect(h.client.start("conversation-1", "peer-1", "audio")).rejects.toThrow();
    expect(h.client.state).toMatchObject({ status: "ended", failure: "permission-denied" });
    expect(h.socket.emitted.some((e) => e.event === "call:invite")).toBe(false);
  });
});
