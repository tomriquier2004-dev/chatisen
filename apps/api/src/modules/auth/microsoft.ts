import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { MicrosoftConfig } from "../../config";

/** Tenant des comptes Microsoft personnels (outlook.com, hotmail.com, live.com…). */
export const CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";
const AUTHORITY = "https://login.microsoftonline.com";
/** Autorités « multi-tenant » : l'émetteur du jeton dépend alors du tenant de l'utilisateur. */
const MULTI_TENANT = new Set(["common", "organizations", "consumers"]);
const SCOPE = "openid profile email";

/** Ce que ChatISEN retient d'une connexion Microsoft réussie. */
export interface MicrosoftIdentity {
  /** Identifiant stable : `tid:oid` (tenant + objet utilisateur), jamais l'adresse e-mail. */
  subject: string;
  tenantId: string;
  email: string | undefined;
  /**
   * Vrai seulement si Microsoft garantit que le domaine de l'adresse appartient au tenant de
   * l'utilisateur (`xms_edov`). Seule une adresse vérifiée permet de lier un compte existant.
   */
  emailVerified: boolean;
  name: string | undefined;
}

/** Échec de la connexion ; `reason` devient le `?authError=` renvoyé au client. */
export class MicrosoftLoginError extends Error {
  override name = "MicrosoftLoginError";
  constructor(
    readonly reason: "MICROSOFT_FAILED" | "MICROSOFT_TENANT_NOT_ALLOWED",
    message: string,
  ) {
    super(message);
  }
}

export interface MicrosoftClient {
  authorizationUrl(params: { state: string; nonce: string; codeVerifier: string }): string;
  /** Échange le code contre les jetons et valide le jeton ID (signature, émetteur, audience, nonce). */
  exchangeCode(code: string, codeVerifier: string, nonce: string): Promise<MicrosoftIdentity>;
}

export interface MicrosoftClientOptions {
  fetch?: typeof fetch;
  /** Clés de signature ; par défaut le JWKS public de Microsoft, mis en cache par jose. */
  jwks?: JWTVerifyGetKey;
  now?: () => Date;
}

/** Valeur aléatoire en base64url (state, nonce, vérificateur PKCE de 43 caractères). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** PKCE S256 (RFC 7636) : empreinte SHA-256 du vérificateur, en base64url. */
export function codeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

/**
 * Client OpenID Connect de Microsoft Entra ID (ADR-0020) : flux Authorization Code + PKCE,
 * client confidentiel (secret côté API uniquement). Les points de terminaison v2.0 sont fixes et
 * documentés par Microsoft : pas de lecture du document de découverte à chaque démarrage.
 */
export class EntraIdClient implements MicrosoftClient {
  private readonly fetchFn: typeof fetch;
  private readonly jwks: JWTVerifyGetKey;
  private readonly now: () => Date;
  private readonly base: string;

  constructor(
    private readonly config: MicrosoftConfig,
    opts: MicrosoftClientOptions = {},
  ) {
    this.base = `${AUTHORITY}/${encodeURIComponent(config.tenant)}`;
    this.fetchFn = opts.fetch ?? ((...args) => fetch(...args));
    this.jwks = opts.jwks ?? createRemoteJWKSet(new URL(`${this.base}/discovery/v2.0/keys`));
    this.now = opts.now ?? (() => new Date());
  }

  authorizationUrl({ state, nonce, codeVerifier }: { state: string; nonce: string; codeVerifier: string }): string {
    const url = new URL(`${this.base}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      redirect_uri: this.config.redirectUri,
      response_mode: "query",
      scope: SCOPE,
      state,
      nonce,
      code_challenge: codeChallenge(codeVerifier),
      code_challenge_method: "S256",
      // Laisse choisir le compte : utile sur un poste où plusieurs comptes Microsoft sont ouverts.
      prompt: "select_account",
    }).toString();
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string, nonce: string): Promise<MicrosoftIdentity> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.base}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: this.config.redirectUri,
          code_verifier: codeVerifier,
          scope: SCOPE,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new MicrosoftLoginError("MICROSOFT_FAILED", "token endpoint unreachable");
    }
    const body = (await res.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
    if (!res.ok || typeof body.id_token !== "string") {
      // Le code d'erreur OAuth (invalid_grant…) est sans donnée personnelle ; la description n'est pas reprise.
      throw new MicrosoftLoginError("MICROSOFT_FAILED", `token exchange failed: ${res.status} ${String(body.error ?? "")}`);
    }
    return this.verifyIdToken(body.id_token, nonce);
  }

  /** Validation du jeton ID selon OpenID Connect Core § 3.1.3.7, adaptée au multi-tenant Entra. */
  async verifyIdToken(idToken: string, nonce: string): Promise<MicrosoftIdentity> {
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, this.jwks, {
        algorithms: ["RS256"],
        audience: this.config.clientId,
        currentDate: this.now(),
        clockTolerance: 60,
        requiredClaims: ["iss", "sub", "aud", "exp", "iat", "nonce", "tid", "oid"],
      }));
    } catch (err) {
      throw new MicrosoftLoginError("MICROSOFT_FAILED", `invalid id token: ${(err as Error).message}`);
    }
    const { tid, oid, iss } = payload;
    if (typeof tid !== "string" || typeof oid !== "string" || !/^[0-9a-f-]{36}$/i.test(tid)) {
      throw new MicrosoftLoginError("MICROSOFT_FAILED", "invalid tid/oid");
    }
    // Avec `common`, l'émetteur attendu se déduit du tenant du jeton ; avec un tenant précis, il est fixe.
    // jose a déjà vérifié la signature avec les clés Microsoft : un émetteur conforme ne peut venir que d'eux.
    if (iss !== `${AUTHORITY}/${tid}/v2.0`) throw new MicrosoftLoginError("MICROSOFT_FAILED", "unexpected issuer");
    if (!MULTI_TENANT.has(this.config.tenant) && this.config.tenant.toLowerCase() !== tid.toLowerCase()) {
      throw new MicrosoftLoginError("MICROSOFT_TENANT_NOT_ALLOWED", "tenant differs from configured authority");
    }
    if (this.config.tenant === "consumers" && tid !== CONSUMER_TENANT_ID) {
      throw new MicrosoftLoginError("MICROSOFT_TENANT_NOT_ALLOWED", "not a personal account");
    }
    if (this.config.allowedTenants && !this.config.allowedTenants.includes(tid.toLowerCase())) {
      throw new MicrosoftLoginError("MICROSOFT_TENANT_NOT_ALLOWED", "tenant not in allow list");
    }
    if (payload.nonce !== nonce) throw new MicrosoftLoginError("MICROSOFT_FAILED", "nonce mismatch");

    const email = typeof payload.email === "string" && payload.email.includes("@") ? payload.email : undefined;
    return {
      subject: `${tid.toLowerCase()}:${oid.toLowerCase()}`,
      tenantId: tid.toLowerCase(),
      email,
      emailVerified: email !== undefined && payload.xms_edov === true,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  }
}
