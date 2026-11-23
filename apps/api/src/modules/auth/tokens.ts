import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { unauthenticated } from "../../errors";

const ISSUER = "chatisen";
const AUDIENCE = "chatisen-api";

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

/** Refresh token opaque : 256 bits aléatoires. Seule son empreinte SHA-256 est stockée en base. */
export function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
