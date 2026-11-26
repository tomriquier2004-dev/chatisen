import { createHmac } from "node:crypto";
import type { FastifyInstance, onRequestAsyncHookHandler } from "fastify";
import { TurnCredentialsResponse } from "@chatisen/shared";
import { AppError } from "../../errors";
import { requireAuth } from "../../plugins/authenticate";
import { RATE_RULES, rateLimit, type RateLimiter } from "../../plugins/rate-limit";

export interface TurnRoutesOptions {
  authenticate: onRequestAsyncHookHandler;
  limits: { limiter: RateLimiter; enabled: boolean };
  sharedSecret?: string;
  urls?: string;
  credentialTtlSeconds: number;
}

/** Identifiants coturn REST éphémères (use-auth-secret), calculés côté serveur uniquement. */
export async function turnRoutes(app: FastifyInstance, opts: TurnRoutesOptions): Promise<void> {
  app.addHook("onRequest", opts.authenticate);
  const limitCredentials = rateLimit(opts.limits.limiter, opts.limits.enabled, RATE_RULES.turnCredentialsPerUser);

  app.get(
    "/turn/credentials",
    {
      preHandler: limitCredentials,
      schema: { response: { 200: TurnCredentialsResponse } },
    },
    async (request): Promise<TurnCredentialsResponse> => {
      const { userId } = requireAuth(request);
      if (!opts.sharedSecret || !opts.urls) {
        throw new AppError(503, "INTERNAL_ERROR", "Le service TURN n'est pas configuré");
      }

      const urls = opts.urls.split(",").map((url) => url.trim()).filter(Boolean);
      if (urls.length === 0 || urls.some((url) => !/^(stun|stuns|turn|turns):/i.test(url))) {
        request.log.error("invalid TURN URL configuration");
        throw new AppError(503, "INTERNAL_ERROR", "Configuration TURN invalide");
      }

      const expiresAt = Math.floor(Date.now() / 1000) + opts.credentialTtlSeconds;
      const username = `${expiresAt}:${userId}`;
      const credential = createHmac("sha1", opts.sharedSecret).update(username).digest("base64");

      return { urls, username, credential, ttl: opts.credentialTtlSeconds };
    },
  );
}
