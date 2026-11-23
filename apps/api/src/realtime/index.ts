import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import type { TSchema } from "@sinclair/typebox";
import {
  ConversationSyncPayload,
  MessageReadPayload,
  MessageSendPayload,
  type Ack,
  type ClientToServerEvents,
  type ErrorCode,
  type ServerToClientEvents,
} from "@chatisen/shared";
import { AppError } from "../errors";
import { requireMember } from "../modules/conversations/service";
import { markRead, messagesAfter, storeMessage } from "../modules/messages/service";
import { conversationRoom, sessionRoom, userRoom, type RealtimeEvents } from "./events";
import { MAX_CONNECTIONS_PER_USER, MESSAGE_SEND_RULE, type RateLimiter } from "../plugins/rate-limit";

export { conversationRoom, sessionRoom, userRoom } from "./events";

export interface SocketData {
  userId: string;
  sessionId: string;
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;


export interface Realtime {
  io: IoServer;
  /** Redis joignable ? undefined quand l'API tourne sans adapter Redis (instance unique). */
  redisStatus(): Promise<"up" | "down" | undefined>;
}

/**
 * Socket.IO sur le serveur HTTP de Fastify (architecture § 2 et § 5.2).
 * - JWT vérifié au handshake ; déconnexion programmée à son expiration (§ 6.1) ;
 * - rooms `user:<id>` et `conv:<id>` jointes par le serveur d'après la base, jamais choisies par le client (FR-03) ;
 * - avec `redisUrl`, l'adapter Redis diffuse entre les instances d'API (NFR-02).
 */
export async function attachRealtime(
  app: FastifyInstance,
  opts: {
    redisUrl?: string;
    events?: RealtimeEvents;
    /** Limites des événements (issue #88) ; absentes ou désactivées : aucune limite. */
    rateLimit?: { limiter: RateLimiter; enabled: boolean };
  },
): Promise<Realtime> {
  const io: IoServer = new Server(app.server, {
    path: "/socket.io",
    // Même origine que le client (Caddy en déploiement, proxy Vite en dev) : pas de CORS.
    cors: undefined,
    serveClient: false,
  });

  const limits = opts.rateLimit;
  let pub: ReturnType<typeof createClient> | undefined;
  let sub: ReturnType<typeof createClient> | undefined;
  if (opts.redisUrl) {
    pub = createClient({ url: opts.redisUrl });
    sub = pub.duplicate();
    for (const client of [pub, sub]) client.on("error", (err) => app.log.warn({ err }, "redis error"));
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
  }

  io.use(async (socket, next) => {
    try {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token !== "string") throw new AppError(401, "UNAUTHENTICATED", "Token absent");
      const claims = await app.tokens.verifyAccessToken(token);

      // Connexions simultanées bornées par utilisateur, toutes instances confondues (adapter Redis).
      if (limits?.enabled) {
        const existing = await io.in(userRoom(claims.userId)).fetchSockets();
        if (existing.length >= MAX_CONNECTIONS_PER_USER) {
          throw new AppError(429, "RATE_LIMITED", "Trop de connexions simultanées");
        }
      }
      socket.data.userId = claims.userId;
      socket.data.sessionId = claims.sessionId;

      const memberships = await app.db
        .selectFrom("conversation_members")
        .select("conversation_id")
        .where("user_id", "=", claims.userId)
        .execute();
      await socket.join([
        userRoom(claims.userId),
        sessionRoom(claims.sessionId),
        ...memberships.map((m) => conversationRoom(m.conversation_id)),
      ]);

      // À l'expiration du JWT, le client rafraîchit son token puis se reconnecte (architecture § 6.1).
      const ttl = claims.exp * 1000 - Date.now();
      const timer = setTimeout(() => socket.disconnect(true), Math.max(ttl, 0));
      socket.once("disconnect", () => clearTimeout(timer));
      next();
    } catch (err) {
      const code = err instanceof AppError ? err.code : "INTERNAL_ERROR";
      if (!(err instanceof AppError)) app.log.error({ err }, "socket handshake failed");
      next(Object.assign(new Error(code), { data: { code } }));
    }
  });

  opts.events?.bind(io);

  io.on("connection", (socket) => {
    const log = app.log.child({ socketId: socket.id, userId: socket.data.userId });

    socket.on(
      "message:send",
      handler(log, MessageSendPayload, async (payload: MessageSendPayload) => {
        // Limite par utilisateur, vérifiée avant toute écriture en base (issue #88).
        if (limits?.enabled) {
          const { allowed } = await limits.limiter.hit(
            `${MESSAGE_SEND_RULE.name}:${socket.data.userId}`,
            MESSAGE_SEND_RULE.limit,
            MESSAGE_SEND_RULE.windowMs,
          );
          if (!allowed) throw new AppError(429, "RATE_LIMITED", "Trop de messages envoyés, patientez un instant");
        }
        // Autorisation à chaque événement, pas seulement au handshake (§ 5.3).
        await requireMember(app.db, payload.conversationId, socket.data.userId);
        const { message, created } = await storeMessage(app.db, socket.data.userId, payload);
        if (created) io.to(conversationRoom(message.conversationId)).emit("message:new", message);
        return message;
      }),
    );

    socket.on(
      "conversation:sync",
      handler(log, ConversationSyncPayload, async (payload: ConversationSyncPayload) => {
        await requireMember(app.db, payload.conversationId, socket.data.userId);
        return messagesAfter(app.db, payload.conversationId, payload.afterSeq);
      }),
    );

    // Accusé de lecture : last_read_seq ne recule jamais et ne dépasse pas le dernier message.
    socket.on(
      "message:read",
      handler(log, MessageReadPayload, async (payload: MessageReadPayload) => {
        await requireMember(app.db, payload.conversationId, socket.data.userId);
        return markRead(app.db, payload.conversationId, socket.data.userId, payload.seq);
      }),
    );
  });

  app.addHook("onClose", async () => {
    await io.close();
    await Promise.all([pub?.quit(), sub?.quit()]);
  });

  const redisStatus = async (): Promise<"up" | "down" | undefined> => {
    if (!pub) return undefined;
    // Délai court : sans lui, un ping vers un Redis coupé attend la reconnexion et la sonde
    // /health/ready ne répond plus (constaté en arrêtant Redis, issue #88).
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("redis ping timeout")), 1000);
    });
    try {
      await Promise.race([pub.ping(), timeout]);
      return "up";
    } catch {
      return "down";
    } finally {
      clearTimeout(timer);
    }
  };
  app.redisStatus = redisStatus;
  return { io, redisStatus };
}

type Logger = FastifyInstance["log"];

/**
 * Enveloppe commune des événements client → serveur : validation du payload par schéma,
 * réponse dans l'ack au format unique, jamais de détail interne en cas d'erreur.
 */
function handler<S extends TSchema, P, R>(log: Logger, schema: S, run: (payload: P) => Promise<R>) {
  const check = TypeCompiler.Compile(schema);
  return async (payload: unknown, ack?: (res: Ack<R>) => void) => {
    const requestId = randomUUID();
    const fail = (code: ErrorCode, message: string) => ack?.({ ok: false, error: { code, message, requestId } });
    if (typeof ack !== "function") return;
    if (!check.Check(payload)) {
      const first = check.Errors(payload).First();
      fail("VALIDATION_FAILED", first ? `${first.path || "payload"}: ${first.message}` : "Payload invalide");
      return;
    }
    try {
      ack({ ok: true, data: await run(payload as P) });
    } catch (err) {
      if (err instanceof AppError) return void fail(err.code, err.message);
      log.error({ err, requestId }, "socket handler failed");
      fail("INTERNAL_ERROR", "Erreur interne du serveur");
    }
  };
}
