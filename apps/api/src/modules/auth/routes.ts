import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  AuthResponse,
  LoginRequest,
  REFRESH_COOKIE,
  RegisterRequest,
  type Me,
} from "@chatisen/shared";
import { AppError, unauthenticated } from "../../errors";
import type { User } from "../../db/schema";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./passwords";
import type { SessionEvents } from "./events";
import { hashRefreshToken, newRefreshToken, type TokenService } from "./tokens";

export interface AuthRoutesOptions {
  tokens: TokenService;
  refreshTtlDays: number;
  /** Cookie `Secure` : vrai en production (HTTPS). En dev, le site tourne en HTTP sur 127.0.0.1. */
  secureCookies: boolean;
  /** Prévenu après chaque révocation, pour fermer les sockets de ces sessions. */
  sessionEvents: SessionEvents;
}

const PG_UNIQUE_VIOLATION = "23505";

export function toMe(user: Pick<User, "id" | "username" | "display_name" | "email">): Me {
  return { id: user.id, username: user.username, displayName: user.display_name, email: user.email };
}

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions): Promise<void> {
  const { tokens, refreshTtlDays, secureCookies, sessionEvents } = opts;
  const db = app.db;
  const refreshTtlMs = refreshTtlDays * 24 * 3600 * 1000;

  function setRefreshCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(REFRESH_COOKIE.name, token, {
      path: REFRESH_COOKIE.path,
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      maxAge: refreshTtlDays * 24 * 3600,
    });
  }

  function clearRefreshCookie(reply: FastifyReply): void {
    reply.clearCookie(REFRESH_COOKIE.name, { path: REFRESH_COOKIE.path });
  }

  /** Ouvre une session (nouvelle famille ou suite d'une famille) et répond avec les deux tokens. */
  async function issueSession(reply: FastifyReply, user: User, familyId: string): Promise<AuthResponse> {
    const refreshToken = newRefreshToken();
    const session = await db
      .insertInto("sessions")
      .values({
        user_id: user.id,
        refresh_token_hash: hashRefreshToken(refreshToken),
        family_id: familyId,
        expires_at: new Date(Date.now() + refreshTtlMs),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    setRefreshCookie(reply, refreshToken);
    return {
      accessToken: await tokens.signAccessToken(user.id, session.id),
      expiresIn: tokens.accessTtlSeconds,
      user: toMe(user),
    };
  }

  app.post(
    "/auth/register",
    { schema: { body: RegisterRequest, response: { 201: AuthResponse } } },
    async (request, reply) => {
      const body = request.body as RegisterRequest;
      const passwordHash = await hashPassword(body.password);
      let user: User;
      try {
        user = await db
          .insertInto("users")
          .values({
            username: body.username,
            email: body.email,
            password_hash: passwordHash,
            display_name: body.displayName,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      } catch (err) {
        if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
          const constraint = (err as { constraint?: string }).constraint ?? "";
          if (constraint.includes("email")) throw new AppError(409, "EMAIL_TAKEN", "Adresse déjà utilisée");
          throw new AppError(409, "USERNAME_TAKEN", "Nom d'utilisateur déjà pris");
        }
        throw err;
      }
      reply.code(201);
      return issueSession(reply, user, randomUUID());
    },
  );

  app.post(
    "/auth/login",
    { schema: { body: LoginRequest, response: { 200: AuthResponse } } },
    async (request, reply) => {
      const body = request.body as LoginRequest;
      const user = await db.selectFrom("users").selectAll().where("username", "=", body.username).executeTakeFirst();
      // Même travail que l'utilisateur existe ou non (pas d'énumération par le temps de réponse).
      const ok = await verifyPassword(user?.password_hash ?? (await dummyPasswordHash()), body.password);
      if (!user || !ok) throw new AppError(401, "INVALID_CREDENTIALS", "Identifiant ou mot de passe incorrect");
      return issueSession(reply, user, randomUUID());
    },
  );

  /**
   * Rotation : chaque refresh token ne sert qu'une fois. Présenter un token déjà utilisé
   * révoque toute la famille de sessions (signe de vol, architecture § 6.1).
   */
  app.post("/auth/refresh", { schema: { response: { 200: AuthResponse } } }, async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE.name];
    if (!presented) throw unauthenticated("Session absente");

    const session = await db
      .selectFrom("sessions")
      .selectAll()
      .where("refresh_token_hash", "=", hashRefreshToken(presented))
      .executeTakeFirst();
    if (!session) {
      clearRefreshCookie(reply);
      throw unauthenticated("Session inconnue");
    }

    // Révocation conditionnelle : si deux requêtes utilisent le même token, une seule gagne.
    const consumed = await db
      .updateTable("sessions")
      .set({ revoked_at: new Date() })
      .where("id", "=", session.id)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
      .returning("id")
      .executeTakeFirst();

    if (!consumed) {
      if (session.revoked_at !== null) {
        const revoked = await db
          .updateTable("sessions")
          .set({ revoked_at: new Date() })
          .where("family_id", "=", session.family_id)
          .where("revoked_at", "is", null)
          .returning("id")
          .execute();
        // Les sockets ouvertes avec un token de cette famille sont fermées aussi (le dernier access
        // token émis porte l'identifiant de la dernière session de la famille).
        await sessionEvents.sessionsRevoked([session.id, ...revoked.map((r) => r.id)]);
        request.log.warn({ userId: session.user_id, familyId: session.family_id }, "refresh token reuse detected");
      }
      clearRefreshCookie(reply);
      throw unauthenticated("Session expirée ou révoquée");
    }

    const user = await db.selectFrom("users").selectAll().where("id", "=", session.user_id).executeTakeFirstOrThrow();
    return issueSession(reply, user, session.family_id);
  });

  app.post("/auth/logout", async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE.name];
    if (presented) {
      const revoked = await db
        .updateTable("sessions")
        .set({ revoked_at: new Date() })
        .where("refresh_token_hash", "=", hashRefreshToken(presented))
        .where("revoked_at", "is", null)
        .returning("id")
        .execute();
      await sessionEvents.sessionsRevoked(revoked.map((r) => r.id));
    }
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });
}
