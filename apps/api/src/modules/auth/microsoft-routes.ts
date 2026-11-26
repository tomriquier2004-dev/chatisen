import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { Type } from "@sinclair/typebox";
import { MICROSOFT_FLOW_COOKIE, type MicrosoftLoginError as LoginErrorCode } from "@chatisen/shared";
import type { User } from "../../db/schema";
import { RATE_RULES, rateLimit, type RateLimiter } from "../../plugins/rate-limit";
import { MicrosoftLoginError, randomToken, type MicrosoftClient, type MicrosoftIdentity } from "./microsoft";
import type { FlowStateSigner } from "./tokens";
import { FLOW_TTL_SECONDS } from "./tokens";

const PG_UNIQUE_VIOLATION = "23505";
/** Page d'accueil du client, servie sur la même origine que l'API (Caddy en déploiement, proxy Vite en dev). */
const WEB_HOME = "/";

export interface MicrosoftRoutesOptions {
  client: MicrosoftClient;
  flowSigner: FlowStateSigner;
  secureCookies: boolean;
  limits: { limiter: RateLimiter; enabled: boolean };
  /** Ouvre la session ChatISEN (même mécanisme que la connexion par mot de passe, ADR-0007). */
  issueSession: (reply: FastifyReply, user: User, familyId: string) => Promise<unknown>;
}

class LoginRefused extends Error {
  constructor(readonly reason: LoginErrorCode) {
    super(reason);
  }
}

const CallbackQuery = Type.Object({
  code: Type.Optional(Type.String({ maxLength: 4096 })),
  state: Type.Optional(Type.String({ maxLength: 256 })),
  error: Type.Optional(Type.String({ maxLength: 256 })),
});

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Nom d'utilisateur tiré de l'adresse : partie locale réduite aux caractères autorisés (3 à 32). */
export function usernameCandidate(email: string, attempt: number): string {
  let base = email.split("@")[0]!.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 24);
  if (base.length < 3) base = `user_${base}`;
  return attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
}

/**
 * Connexion Microsoft Entra ID (ADR-0020) :
 * - GET /auth/microsoft/start : prépare state, nonce et PKCE, les garde dans un cookie signé
 *   `SameSite=Lax` (le retour de Microsoft est une navigation intersite) et redirige vers Microsoft.
 * - GET /auth/microsoft/callback : vérifie state et cookie, échange le code, valide le jeton ID,
 *   retrouve ou crée le compte, ouvre la session (cookie de refresh) et renvoie vers l'accueil.
 * Les échecs reviennent au client par `/?authError=<code>`, sans détail interne.
 */
export async function microsoftRoutes(app: FastifyInstance, opts: MicrosoftRoutesOptions): Promise<void> {
  const { client, flowSigner, secureCookies, issueSession } = opts;
  const limit = rateLimit(opts.limits.limiter, opts.limits.enabled, RATE_RULES.microsoftPerIp);
  const db = app.db;

  const clearFlowCookie = (reply: FastifyReply) =>
    reply.clearCookie(MICROSOFT_FLOW_COOKIE.name, { path: MICROSOFT_FLOW_COOKIE.path });
  const fail = (reply: FastifyReply, reason: LoginErrorCode) =>
    reply.redirect(`${WEB_HOME}?authError=${reason}`, 303);

  app.get("/auth/microsoft/start", { preHandler: limit }, async (_request, reply) => {
    const flow = { state: randomToken(), nonce: randomToken(), codeVerifier: randomToken() };
    reply.setCookie(MICROSOFT_FLOW_COOKIE.name, await flowSigner.sign(flow), {
      path: MICROSOFT_FLOW_COOKIE.path,
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      maxAge: FLOW_TTL_SECONDS,
    });
    reply.header("cache-control", "no-store");
    return reply.redirect(client.authorizationUrl(flow), 302);
  });

  app.get("/auth/microsoft/callback", { preHandler: limit, schema: { querystring: CallbackQuery } }, async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    const flow = await flowSigner.verify(request.cookies[MICROSOFT_FLOW_COOKIE.name]);
    clearFlowCookie(reply);
    reply.header("cache-control", "no-store");

    if (query.error) {
      request.log.info({ oauthError: query.error }, "microsoft login cancelled or refused");
      return fail(reply, query.error === "access_denied" ? "MICROSOFT_DENIED" : "MICROSOFT_FAILED");
    }
    // Sans cookie valide ou avec un state différent, la réponse ne vient pas d'une connexion lancée
    // par ce navigateur (CSRF de connexion) ou la tentative a expiré.
    if (!flow || !query.code || !query.state || !sameString(query.state, flow.state)) {
      request.log.warn("microsoft callback without matching state");
      return fail(reply, "MICROSOFT_FAILED");
    }

    let identity: MicrosoftIdentity;
    try {
      identity = await client.exchangeCode(query.code, flow.codeVerifier, flow.nonce);
    } catch (err) {
      if (err instanceof MicrosoftLoginError) {
        request.log.warn({ reason: err.reason, detail: err.message }, "microsoft login rejected");
        return fail(reply, err.reason);
      }
      throw err;
    }

    let user: User;
    try {
      user = await findOrCreateUser(identity);
    } catch (err) {
      if (err instanceof LoginRefused) {
        request.log.info({ reason: err.reason, tenantId: identity.tenantId }, "microsoft login refused");
        return fail(reply, err.reason);
      }
      throw err;
    }
    request.log.info({ userId: user.id, tenantId: identity.tenantId }, "microsoft login");
    await issueSession(reply, user, randomUUID());
    return reply.redirect(WEB_HOME, 303);
  });

  async function userOfIdentity(subject: string): Promise<User | undefined> {
    return db
      .selectFrom("user_identities")
      .innerJoin("users", "users.id", "user_identities.user_id")
      .selectAll("users")
      .where("user_identities.provider", "=", "microsoft")
      .where("user_identities.subject", "=", subject)
      .executeTakeFirst();
  }

  /**
   * 1. Identité déjà liée : son compte.
   * 2. Adresse déjà utilisée par un compte : liaison seulement si Microsoft garantit l'adresse
   *    (`xms_edov`), sinon refus. Lier sur une adresse non vérifiée permettrait à l'administrateur
   *    de n'importe quel tenant de prendre un compte en déclarant l'adresse de sa victime.
   * 3. Sinon : nouveau compte sans mot de passe, lié à l'identité.
   */
  async function findOrCreateUser(identity: MicrosoftIdentity): Promise<User> {
    const linked = await userOfIdentity(identity.subject);
    if (linked) return linked;
    if (!identity.email) throw new LoginRefused("MICROSOFT_EMAIL_MISSING");

    const existing = await db.selectFrom("users").selectAll().where("email", "=", identity.email).executeTakeFirst();
    if (existing) {
      if (!identity.emailVerified) throw new LoginRefused("MICROSOFT_ACCOUNT_EXISTS");
      await db
        .insertInto("user_identities")
        .values({ provider: "microsoft", subject: identity.subject, user_id: existing.id })
        .onConflict((oc) => oc.columns(["provider", "subject"]).doNothing())
        .execute();
      return (await userOfIdentity(identity.subject)) ?? existing;
    }

    const displayName = (identity.name?.trim() || identity.email.split("@")[0]!).slice(0, 64);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await db.transaction().execute(async (trx) => {
          const user = await trx
            .insertInto("users")
            .values({
              username: usernameCandidate(identity.email!, attempt),
              email: identity.email!,
              password_hash: null,
              display_name: displayName,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          await trx.insertInto("user_identities").values({ provider: "microsoft", subject: identity.subject, user_id: user.id }).execute();
          return user;
        });
      } catch (err) {
        if ((err as { code?: string }).code !== PG_UNIQUE_VIOLATION) throw err;
        const constraint = (err as { constraint?: string }).constraint ?? "";
        // Course entre deux retours simultanés de la même identité : l'autre a créé le compte.
        const raced = await userOfIdentity(identity.subject);
        if (raced) return raced;
        if (constraint.includes("email")) throw new LoginRefused("MICROSOFT_ACCOUNT_EXISTS");
        // Nom déjà pris : nouvel essai avec un suffixe aléatoire.
      }
    }
    throw new Error("could not allocate a username for a Microsoft account");
  }
}
