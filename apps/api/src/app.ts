import { randomUUID } from "node:crypto";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { sql } from "kysely";
import {
  API_PREFIX,
  ErrorResponse,
  HealthLiveResponse,
  HealthReadyResponse,
  type ErrorCode,
} from "@chatisen/shared";
import cookie from "@fastify/cookie";
import { secureCookies, type Config } from "./config";
import type { Db } from "./db";
import { AppError } from "./errors";
import { noopSessionEvents, type SessionEvents } from "./modules/auth/events";
import { authRoutes } from "./modules/auth/routes";
import { noopMembershipEvents, type MembershipEvents } from "./modules/conversations/events";
import { conversationRoutes } from "./modules/conversations/routes";
import { messageRoutes } from "./modules/messages/routes";
import { TokenService } from "./modules/auth/tokens";
import { userRoutes } from "./modules/users/routes";
import { makeAuthenticate } from "./plugins/authenticate";
import { MemoryRateLimiter, type RateLimiter } from "./plugins/rate-limit";

export interface AppDeps {
  db: Db;
  /** Changements d'appartenance, branchés sur le temps réel quand il existe (architecture § 5.3). */
  membershipEvents?: MembershipEvents;
  /** Révocations de sessions, pour la déconnexion forcée des sockets (architecture § 5.3). */
  sessionEvents?: SessionEvents;
  /** Compteurs de limitation de débit ; en mémoire par défaut, Redis en déploiement (issue #71). */
  rateLimiter?: RateLimiter;
}

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    tokens: TokenService;
    /** État de Redis pour /health/ready ; remplacé par attachRealtime quand l'adapter Redis est actif. */
    redisStatus: () => Promise<"up" | "down" | undefined>;
  }
}

function errorBody(code: ErrorCode, message: string, requestId: string): ErrorResponse {
  return { error: { code, message, requestId } };
}

/** Correspondance statut HTTP → code d'erreur (architecture § 5.1, issue #60). */
export function codeForStatus(status: number): { code: ErrorCode; message: string } {
  switch (status) {
    case 401:
      return { code: "UNAUTHENTICATED", message: "Authentification requise" };
    case 403:
      return { code: "FORBIDDEN", message: "Action non autorisée" };
    case 404:
      return { code: "NOT_FOUND", message: "Ressource introuvable" };
    case 429:
      return { code: "RATE_LIMITED", message: "Trop de requêtes, réessayez plus tard" };
    default:
      return { code: "VALIDATION_FAILED", message: "Requête invalide" };
  }
}

export function buildApp(config: Config, deps: AppDeps): FastifyInstance {
  const app = Fastify({
    // Logs JSON (pino) ; chaque ligne porte reqId, le même identifiant que error.requestId (architecture § 10.1).
    // Pas de requestIdHeader : un identifiant envoyé par le client ne fait pas foi.
    logger: { level: config.LOG_LEVEL },
    genReqId: () => randomUUID(),
    trustProxy: config.TRUST_PROXY,
  });
  const limits = { limiter: deps.rateLimiter ?? new MemoryRateLimiter(), enabled: config.RATE_LIMIT_ENABLED };

  const tokens = new TokenService(config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS);
  const authenticate = makeAuthenticate(tokens);

  app.decorate("db", deps.db);
  app.decorate("tokens", tokens);
  app.decorate("redisStatus", async (): Promise<"up" | "down" | undefined> => undefined);
  app.addSchema(ErrorResponse);
  app.register(cookie);

  // Toute erreur sort au format unique du § 5.1, sans détail interne (FR-18, NFR-04).
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.message, request.id));
    }
    if (error.validation) {
      return reply.code(400).send(errorBody("VALIDATION_FAILED", error.message, request.id));
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, "unhandled error");
      return reply.code(500).send(errorBody("INTERNAL_ERROR", "Erreur interne du serveur", request.id));
    }
    // Autres 4xx (plugins, parseur JSON…) : code selon le statut, message générique (pas de détail interne).
    const { code, message } = codeForStatus(status);
    return reply.code(status).send(errorBody(code, message, request.id));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(errorBody("NOT_FOUND", `Route introuvable : ${request.method} ${request.url}`, request.id)),
  );

  app.register(
    async (api) => {
      api.get(
        "/health/live",
        { schema: { response: { 200: HealthLiveResponse } } },
        async (): Promise<HealthLiveResponse> => ({ status: "ok", uptimeSeconds: process.uptime() }),
      );

      api.get(
        "/health/ready",
        { schema: { response: { 200: HealthReadyResponse, 503: HealthReadyResponse } } },
        async (request, reply): Promise<HealthReadyResponse> => {
          let postgres: "up" | "down" = "up";
          try {
            await sql`SELECT 1`.execute(api.db);
          } catch (err) {
            request.log.warn({ err }, "postgres unreachable");
            postgres = "down";
          }
          const redis = await app.redisStatus();
          const ready = postgres === "up" && redis !== "down";
          reply.code(ready ? 200 : 503);
          return { status: ready ? "ready" : "not_ready", checks: redis ? { postgres, redis } : { postgres } };
        },
      );

      await api.register(authRoutes, {
        tokens,
        refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
        secureCookies: secureCookies(config),
        sessionEvents: deps.sessionEvents ?? noopSessionEvents,
        limits,
      });
      await api.register(userRoutes, { authenticate });
      await api.register(messageRoutes, { authenticate });
      await api.register(conversationRoutes, {
        authenticate,
        events: deps.membershipEvents ?? noopMembershipEvents,
        limits,
      });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
