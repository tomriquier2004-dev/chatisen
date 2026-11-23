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
import type { Config } from "./config";
import type { Db } from "./db";
import { AppError } from "./errors";
import { authRoutes } from "./modules/auth/routes";
import { TokenService } from "./modules/auth/tokens";
import { userRoutes } from "./modules/users/routes";
import { makeAuthenticate } from "./plugins/authenticate";

export interface AppDeps {
  db: Db;
}

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    tokens: TokenService;
  }
}

function errorBody(code: ErrorCode, message: string, requestId: string): ErrorResponse {
  return { error: { code, message, requestId } };
}

export function buildApp(config: Config, deps: AppDeps): FastifyInstance {
  const app = Fastify({
    // Logs JSON (pino) ; chaque ligne porte reqId, le même identifiant que error.requestId (architecture § 10.1).
    // Pas de requestIdHeader : un identifiant envoyé par le client ne fait pas foi.
    logger: { level: config.LOG_LEVEL },
    genReqId: () => randomUUID(),
  });

  const tokens = new TokenService(config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS);
  const authenticate = makeAuthenticate(tokens);

  app.decorate("db", deps.db);
  app.decorate("tokens", tokens);
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
    return reply.code(status).send(errorBody("VALIDATION_FAILED", error.message, request.id));
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
          const ready = postgres === "up";
          reply.code(ready ? 200 : 503);
          return { status: ready ? "ready" : "not_ready", checks: { postgres } };
        },
      );

      await api.register(authRoutes, {
        tokens,
        refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
        secureCookies: config.NODE_ENV === "production",
      });
      await api.register(userRoutes, { authenticate });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
