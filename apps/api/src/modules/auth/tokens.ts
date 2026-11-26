import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { unauthenticated } from "../../errors";

const ISSUER = "chatisen";
const AUDIENCE = "chatisen-api";
/** Audience distincte : un jeton d'état de connexion Microsoft n'est jamais accepté comme access token. */
const FLOW_AUDIENCE = "chatisen-oidc-flow";
/** Durée laissée à l'utilisateur pour se connecter chez Microsoft. */
export const FLOW_TTL_SECONDS = 600;

/** État d'une connexion Microsoft en cours, gardé dans un cookie signé entre le départ et le retour. */
export interface MicrosoftFlowState {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface AccessTokenClaims {
  /** Identifiant de l'utilisateur. */
  userId: string;
  /** Identifiant de la session (ligne de `sessions`) qui a émis le token. */
  sessionId: string;
  /** Expiration, en secondes depuis l'époque Unix. */
  exp: number;
}

/** Signe et vérifie les access tokens (JWT HS256, durée courte, architecture § 6.1). */
export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    readonly accessTtlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async signAccessToken(userId: string, sessionId: string): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSeconds}s`)
      .sign(this.key);
  }

  /** Lève une erreur 401 UNAUTHENTICATED si le token est absent, invalide ou expiré. */
  async verifyAccessToken(token: string, currentDate?: Date): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        issuer: ISSUER,
        audience: AUDIENCE,
        ...(currentDate ? { currentDate } : {}),
      });
      if (typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.exp !== "number") {
        throw unauthenticated("Token invalide");
      }
      return { userId: payload.sub, sessionId: payload.sid, exp: payload.exp };
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) throw unauthenticated("Token expiré");
      if (err instanceof joseErrors.JOSEError) throw unauthenticated("Token invalide");
      throw err;
    }
  }
}

/**
 * Signe et vérifie l'état d'une connexion Microsoft. Le cookie est signé (HS256, clé JWT_SECRET)
 * plutôt que stocké côté serveur : n'importe quelle instance d'API peut traiter le retour.
 */
export class FlowStateSigner {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  sign(flow: MicrosoftFlowState): Promise<string> {
    return new SignJWT({ st: flow.state, nn: flow.nonce, cv: flow.codeVerifier })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setAudience(FLOW_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${FLOW_TTL_SECONDS}s`)
      .sign(this.key);
  }

  /** null si le cookie est absent, falsifié, expiré ou mal formé. */
  async verify(token: string | undefined): Promise<MicrosoftFlowState | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"], issuer: ISSUER, audience: FLOW_AUDIENCE });
      const { st, nn, cv } = payload;
      if (typeof st !== "string" || typeof nn !== "string" || typeof cv !== "string") return null;
      return { state: st, nonce: nn, codeVerifier: cv };
    } catch {
      return null;
    }
  }
}

/** Refresh token opaque : 256 bits aléatoires. Seule son empreinte SHA-256 est stockée en base. */
export function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
