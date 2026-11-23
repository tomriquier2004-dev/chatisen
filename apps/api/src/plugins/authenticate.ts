import type { FastifyReply, FastifyRequest } from "fastify";
import { unauthenticated } from "../errors";
import type { TokenService } from "../modules/auth/tokens";

declare module "fastify" {
  interface FastifyRequest {
    /** Renseigné par `authenticate` : utilisateur et session du token présenté. */
    auth?: { userId: string; sessionId: string };
  }
}

/** Lit `Authorization: Bearer <jwt>` ; à utiliser en `preHandler` sur chaque route protégée. */
export function makeAuthenticate(tokens: TokenService) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    const match = header?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
    if (!match?.[1]) throw unauthenticated();
    const { userId, sessionId } = await tokens.verifyAccessToken(match[1]);
    request.auth = { userId, sessionId };
  };
}

/** Raccourci pour les handlers placés derrière `authenticate`. */
export function requireAuth(request: FastifyRequest): { userId: string; sessionId: string } {
  if (!request.auth) throw unauthenticated();
  return request.auth;
}
