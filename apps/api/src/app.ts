import { randomUUID } from "node:crypto";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { API_PREFIX, ErrorResponse, HealthLiveResponse, type ErrorCode } from "@chatisen/shared";
import type { Config } from "./config";

function errorBody(code: ErrorCode, message: string, requestId: string): ErrorResponse {
  return { error: { code, message, requestId } };
}

export function buildApp(config: Config): FastifyInstance {
  const app = Fastify({
    // Logs JSON (pino) ; chaque ligne porte reqId, le même identifiant que error.requestId (architecture § 10.1).
    // Pas de requestIdHeader : un identifiant envoyé par le client ne fait pas foi.
    logger: { level: config.LOG_LEVEL },
    genReqId: () => randomUUID(),
  });

  app.addSchema(ErrorResponse);

  // Toute erreur sort au format unique du § 5.1, sans détail interne (FR-18, NFR-04).
  app.setErrorHandler((error: FastifyError, request, reply) => {
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
    },
    { prefix: API_PREFIX },
  );

  return app;
}
