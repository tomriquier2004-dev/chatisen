import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { FastifyInstance } from "fastify";
import type { Socket } from "socket.io";
import type { TSchema, Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import {
  CallIdPayload,
  CallInvitePayload,
  CallHangupPayload,
  CallMediaStatePayload,
  RtcDescriptionPayload,
  RtcIceCandidatePayload,
  type CallAck,
  type CallInviteAck,
  type ErrorCode,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@chatisen/shared";
import type { Db } from "../db";
import { AppError, forbidden } from "../errors";
import { requireMember } from "../modules/conversations/service";
import type { RateLimiter } from "../plugins/rate-limit";
import { userRoom } from "./events";
import type { IoServer, SocketData } from "./index";
import { callMetrics } from "./call-metrics";

type CallSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Logger = FastifyInstance["log"];

export interface CallSignalingOptions {
  ringTimeoutMs: number;
  disconnectGraceMs: number;
  limits?: { limiter: RateLimiter; enabled: boolean };
}

type CallEndReason = "hangup" | "rejected" | "timeout" | "busy" | "removed" | "disconnected" | "failed";

/** Gestion des appels 1-1 et des relais SDP/ICE, partagée par toutes les sockets d'une instance. */
export class CallSignaling {
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly ringTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly io: IoServer,
    private readonly db: Db,
    private readonly options: CallSignalingOptions,
    private readonly log: Logger,
  ) {}

  attach(socket: CallSocket): void {
    const userId = socket.data.userId;
    const pendingDisconnect = this.disconnectTimers.get(userId);
    if (pendingDisconnect) clearTimeout(pendingDisconnect);
    this.disconnectTimers.delete(userId);

    socket.on("call:invite", this.withLimit(socket, "call-invite", 5, 60_000,
      this.handler(socket, CallInvitePayload, async (payload: Static<typeof CallInvitePayload>) => this.invite(userId, payload))));
    socket.on("call:accept", this.withLimit(socket, "call-action", 30, 60_000,
      this.handler(socket, CallIdPayload, async (payload: Static<typeof CallIdPayload>) => this.accept(userId, payload.callId))));
    socket.on("call:reject", this.withLimit(socket, "call-action", 30, 60_000,
      this.handler(socket, CallIdPayload, async (payload: Static<typeof CallIdPayload>) => this.reject(userId, payload.callId))));
    socket.on("call:hangup", this.withLimit(socket, "call-action", 30, 60_000,
      this.handler(socket, CallHangupPayload, async (payload: Static<typeof CallHangupPayload>) => this.hangup(userId, payload.callId, payload.reason ?? "hangup", payload.negotiationFailed ?? false))));
    socket.on("call:media-state", this.withLimit(socket, "call-action", 30, 60_000,
      this.handler(socket, CallMediaStatePayload, async (payload: Static<typeof CallMediaStatePayload>) => this.relayMediaState(userId, payload))));
    socket.on("rtc:offer", this.withLimit(socket, "rtc-signal", 120, 60_000,
      this.handler(socket, RtcDescriptionPayload, async (payload: Static<typeof RtcDescriptionPayload>) => this.relayDescription(userId, "rtc:offer", payload))));
    socket.on("rtc:answer", this.withLimit(socket, "rtc-signal", 120, 60_000,
      this.handler(socket, RtcDescriptionPayload, async (payload: Static<typeof RtcDescriptionPayload>) => this.relayDescription(userId, "rtc:answer", payload))));
    socket.on("rtc:ice-candidate", this.withLimit(socket, "rtc-signal", 180, 60_000,
      this.handler(socket, RtcIceCandidatePayload, async (payload: Static<typeof RtcIceCandidatePayload>) => this.relayCandidate(userId, payload))));

    socket.once("disconnect", () => this.onDisconnect(userId));
  }

  async close(): Promise<void> {
    for (const timer of [...this.disconnectTimers.values(), ...this.ringTimers.values()]) clearTimeout(timer);
    this.disconnectTimers.clear();
    this.ringTimers.clear();
  }

  private withLimit<P, R>(socket: CallSocket, name: string, limit: number, windowMs: number,
    run: (payload: P, ack?: (result: CallAck<R>) => void) => void) {
    return async (payload: P, ack?: (result: CallAck<R>) => void) => {
      const limiter = this.options.limits;
      if (limiter?.enabled) {
        const result = await limiter.limiter.hit(`${name}:${socket.data.userId}`, limit, windowMs);
        if (!result.allowed) {
          ack?.({ ok: false, error: { code: "RATE_LIMITED", message: "Trop d'événements d'appel, réessayez plus tard", requestId: randomUUID() } });
          return;
        }
      }
      await run(payload, ack);
    };
  }

  private handler<S extends TSchema, P, R>(
    socket: CallSocket,
    schema: S,
    run: (payload: P) => Promise<R>,
  ) {
    const check = TypeCompiler.Compile(schema);
    return async (payload: unknown, ack?: (result: CallAck<R>) => void) => {
      const requestId = randomUUID();
      const fail = (code: ErrorCode, message: string) =>
        ack?.({ ok: false, error: { code, message, requestId } });
      if (typeof ack !== "function") return;
      if (!check.Check(payload)) {
        fail("VALIDATION_FAILED", "Payload invalide");
        return;
      }
      try {
        ack({ ok: true, data: await run(payload as P) });
      } catch (err) {
        if (err instanceof AppError) return void fail(err.code, err.message);
        this.log.error({ err, requestId, userId: socket.data.userId }, "call signaling handler failed");
        fail("INTERNAL_ERROR", "Erreur interne du serveur");
      }
    };
  }

  private async invite(userId: string, payload: CallInvitePayload): Promise<CallInviteAck> {
    await requireMember(this.db, payload.conversationId, userId);
    const conversation = await this.db
      .selectFrom("conversations")
      .select("type")
      .where("id", "=", payload.conversationId)
      .executeTakeFirst();
    if (!conversation || conversation.type !== "private") throw forbidden("Les appels sont réservés aux conversations privées");

    const members = await this.db
      .selectFrom("conversation_members")
      .select("user_id")
      .where("conversation_id", "=", payload.conversationId)
      .execute();
    if (members.length !== 2) throw forbidden("Une conversation d'appel doit avoir exactement deux membres");
    const targetId = members.find((member) => member.user_id !== userId)?.user_id;
    if (!targetId) throw forbidden("Destinataire de l'appel introuvable");

    const result = await this.db.transaction().execute(async (trx) => {
      // Sérialise les invitations qui partagent un participant, y compris vers d'autres conversations.
      for (const id of [userId, targetId].sort()) {
        await sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`.execute(trx);
      }
      const activeCallFor = async (participantId: string) => trx
        .selectFrom("calls as c")
        .innerJoin("conversation_members as m", "m.conversation_id", "c.conversation_id")
        .select("c.id")
        .where("m.user_id", "=", participantId)
        .where("c.ended_at", "is", null)
        .executeTakeFirst();
      if (await activeCallFor(userId)) throw new AppError(409, "CALL_BUSY", "Vous êtes déjà en appel");
      const targetBusy = Boolean(await activeCallFor(targetId));

      const call = await trx
        .insertInto("calls")
        .values({ conversation_id: payload.conversationId, media: payload.media, initiator_id: userId })
        .returning("id")
        .executeTakeFirstOrThrow();
      // L'appelant est le premier participant ; l'appelé ne rejoint qu'après acceptation.
      await trx.insertInto("call_participants").values({ call_id: call.id, user_id: userId }).execute();
      if (targetBusy) {
        await trx.updateTable("calls").set({ ended_at: new Date(), end_reason: "busy" })
          .where("id", "=", call.id).execute();
        await trx.updateTable("call_participants").set({ left_at: new Date() })
          .where("call_id", "=", call.id).execute();
        return { callId: call.id, busy: true };
      }
      return { callId: call.id, busy: false };
    });

    callMetrics.recordStarted();
    if (result.busy) {
      callMetrics.recordEnded("busy", 0);
      this.io.to(userRoom(userId)).emit("call:ended", { callId: result.callId, reason: "busy" });
      return { callId: result.callId };
    }
    this.io.to(userRoom(targetId)).emit("call:incoming", {
      callId: result.callId,
      conversationId: payload.conversationId,
      from: userId,
      media: payload.media,
    });
    const timer = setTimeout(() => void this.expireIfRinging(result.callId), this.options.ringTimeoutMs);
    this.ringTimers.set(result.callId, timer);
    return { callId: result.callId };
  }

  private async accept(userId: string, callId: string): Promise<{ callId: string }> {
    const result = await this.db.transaction().execute(async (trx) => {
      const call = await trx.selectFrom("calls").selectAll().where("id", "=", callId).forUpdate().executeTakeFirst();
      if (!call) throw new AppError(404, "CALL_NOT_FOUND", "Appel introuvable");
      if (call.ended_at) throw new AppError(409, "CALL_ALREADY_ENDED", "Cet appel est déjà terminé");
      if (call.initiator_id === userId) throw forbidden("L'appelant ne peut pas accepter son propre appel");
      const member = await trx.selectFrom("conversation_members").select("user_id")
        .where("conversation_id", "=", call.conversation_id).where("user_id", "=", userId).executeTakeFirst();
      if (!member) throw forbidden("Vous n'êtes pas le destinataire de cet appel");
      const participants = await trx.selectFrom("call_participants").select("user_id")
        .where("call_id", "=", callId).execute();
      if (!participants.some((p) => p.user_id === call.initiator_id)) throw new AppError(409, "CALL_NOT_ACTIVE", "Appel non actif");
      if (!participants.some((p) => p.user_id === userId)) {
        await trx.insertInto("call_participants").values({ call_id: callId, user_id: userId }).execute();
      }
      return { conversationId: call.conversation_id };
    });
    callMetrics.recordAccepted();
    await this.emitToConversation(result.conversationId, "call:accepted", { callId, userId });
    return { callId };
  }

  private async reject(userId: string, callId: string): Promise<{ callId: string }> {
    const call = await this.getCall(callId);
    if (call.initiator_id === userId) throw forbidden("L'appelant ne peut pas refuser son propre appel");
    await this.requireConversationMember(call.conversation_id, userId);
    const ended = await this.endCall(callId, "rejected");
    if (!ended) throw new AppError(409, "CALL_ALREADY_ENDED", "Cet appel est déjà terminé");
    return { callId };
  }

  private async hangup(userId: string, callId: string, reason: "hangup" | "failed", negotiationFailed: boolean): Promise<{ callId: string }> {
    const call = await this.getCall(callId);
    await this.requireConversationMember(call.conversation_id, userId);
    if (negotiationFailed && reason === "failed") callMetrics.recordNegotiationFailure();
    const ended = await this.endCall(callId, reason);
    if (!ended) throw new AppError(409, "CALL_ALREADY_ENDED", "Cet appel est déjà terminé");
    return { callId };
  }

  private async relayMediaState(userId: string, payload: CallMediaStatePayload): Promise<{ relayed: true }> {
    const target = await this.authorizedRelayTarget(userId, payload.callId, payload.to);
    this.io.to(userRoom(target)).emit("call:media-state", {
      callId: payload.callId,
      from: userId,
      cameraEnabled: payload.cameraEnabled,
    });
    return { relayed: true };
  }

  private async relayDescription(userId: string, event: "rtc:offer" | "rtc:answer", payload: RtcDescriptionPayload): Promise<{ relayed: true }> {
    const target = await this.authorizedRelayTarget(userId, payload.callId, payload.to);
    this.io.to(userRoom(target)).emit(event, { callId: payload.callId, from: userId, sdp: payload.sdp });
    return { relayed: true };
  }

  private async relayCandidate(userId: string, payload: RtcIceCandidatePayload): Promise<{ relayed: true }> {
    const target = await this.authorizedRelayTarget(userId, payload.callId, payload.to);
    this.io.to(userRoom(target)).emit("rtc:ice-candidate", { callId: payload.callId, from: userId, candidate: payload.candidate });
    return { relayed: true };
  }

  private async authorizedRelayTarget(userId: string, callId: string, to: string): Promise<string> {
    const call = await this.getCall(callId);
    if (call.ended_at) throw new AppError(409, "CALL_NOT_ACTIVE", "Appel non actif");
    const participants = await this.db.selectFrom("call_participants").select(["user_id", "left_at"])
      .where("call_id", "=", callId).execute();
    if (participants.length !== 2 || participants.some((p) => p.left_at !== null)) {
      throw new AppError(409, "CALL_NOT_ACTIVE", "L'appel n'a pas été accepté ou n'est plus actif");
    }
    const others = participants.filter((p) => p.user_id !== userId);
    if (others.length !== 1 || others[0]!.user_id !== to) throw forbidden("La cible n'est pas l'autre participant de cet appel");
    return to;
  }

  private async getCall(callId: string) {
    const call = await this.db.selectFrom("calls").selectAll().where("id", "=", callId).executeTakeFirst();
    if (!call) throw new AppError(404, "CALL_NOT_FOUND", "Appel introuvable");
    return call;
  }

  private async requireConversationMember(conversationId: string, userId: string): Promise<void> {
    const member = await this.db.selectFrom("conversation_members").select("user_id")
      .where("conversation_id", "=", conversationId).where("user_id", "=", userId).executeTakeFirst();
    if (!member) throw forbidden("Vous n'êtes pas membre de cette conversation");
  }

  private async expireIfRinging(callId: string): Promise<void> {
    this.ringTimers.delete(callId);
    await this.endCallIfRinging(callId);
  }

  private async onDisconnect(userId: string): Promise<void> {
    const previous = this.disconnectTimers.get(userId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(async () => {
      this.disconnectTimers.delete(userId);
      try {
        const sockets = await this.io.in(userRoom(userId)).fetchSockets();
        if (sockets.length > 0) return;
        const active = await this.db.selectFrom("calls as c")
          .innerJoin("conversation_members as m", "m.conversation_id", "c.conversation_id")
          .select("c.id")
          .where("m.user_id", "=", userId)
          .where("c.ended_at", "is", null)
          .execute();
        for (const call of active) await this.endCall(call.id, "disconnected");
      } catch (err) {
        this.log.error({ err, userId }, "failed to process call participant disconnect");
      }
    }, this.options.disconnectGraceMs);
    this.disconnectTimers.set(userId, timer);
  }

  private async endCall(callId: string, reason: CallEndReason): Promise<boolean> {
    return this.finalizeCall(callId, reason, false);
  }

  /** Timeout atomique : une acceptation qui gagne le verrou empêche le timeout de terminer l'appel. */
  private async endCallIfRinging(callId: string): Promise<boolean> {
    return this.finalizeCall(callId, "timeout", true);
  }

  private async finalizeCall(callId: string, reason: CallEndReason, onlyIfRinging: boolean): Promise<boolean> {
    const ended = await this.db.transaction().execute(async (trx) => {
      const call = await trx.selectFrom("calls").selectAll().where("id", "=", callId).forUpdate().executeTakeFirst();
      if (!call || call.ended_at) return undefined;
      if (onlyIfRinging) {
        const participants = await trx.selectFrom("call_participants").select("user_id")
          .where("call_id", "=", callId).execute();
        if (participants.length >= 2) return undefined;
      }
      await trx.updateTable("calls")
        .set({ ended_at: new Date(), end_reason: reason })
        .where("id", "=", callId)
        .where("ended_at", "is", null)
        .execute();
      await trx.updateTable("call_participants")
        .set({ left_at: new Date() })
        .where("call_id", "=", callId)
        .where("left_at", "is", null)
        .execute();
      return { conversationId: call.conversation_id, createdAt: call.started_at };
    });
    if (!ended) return false;
    callMetrics.recordEnded(reason, (Date.now() - Date.parse(String(ended.createdAt))) / 1000);
    const members = await this.db.selectFrom("conversation_members").select("user_id")
      .where("conversation_id", "=", ended.conversationId).execute();
    this.io.to(members.map((m) => userRoom(m.user_id))).emit("call:ended", { callId, reason });
    const timer = this.ringTimers.get(callId);
    if (timer) clearTimeout(timer);
    this.ringTimers.delete(callId);
    return true;
  }

  private async emitToConversation(
    conversationId: string,
    event: "call:accepted",
    payload: { callId: string; userId: string },
  ): Promise<void> {
    const members = await this.db.selectFrom("conversation_members").select("user_id")
      .where("conversation_id", "=", conversationId).execute();
    this.io.to(members.map((member) => userRoom(member.user_id))).emit(event, payload);
  }
}

/** Termine les appels d'une conversation après le commit d'un retrait de membre (§ 5.3). */
export async function endCallsForRemovedMember(db: Db, io: IoServer, conversationId: string, userId: string): Promise<void> {
  const calls = await db.selectFrom("calls").select(["id", "started_at"])
    .where("conversation_id", "=", conversationId).where("ended_at", "is", null).execute();
  for (const call of calls) {
    const ended = await db.transaction().execute(async (trx) => {
      const row = await trx.updateTable("calls")
        .set({ ended_at: new Date(), end_reason: "removed" })
        .where("id", "=", call.id).where("ended_at", "is", null)
        .returning("id").executeTakeFirst();
      if (!row) return false;
      await trx.updateTable("call_participants").set({ left_at: new Date() })
        .where("call_id", "=", call.id).where("left_at", "is", null).execute();
      return true;
    });
    if (!ended) continue;
    callMetrics.recordEnded("removed", (Date.now() - Date.parse(String(call.started_at))) / 1000);
    const members = await db.selectFrom("conversation_members").select("user_id")
      .where("conversation_id", "=", conversationId).execute();
    const recipients = [...new Set([...members.map((m) => m.user_id), userId])];
    io.to(recipients.map(userRoom)).emit("call:ended", { callId: call.id, reason: "removed" });
  }
}
