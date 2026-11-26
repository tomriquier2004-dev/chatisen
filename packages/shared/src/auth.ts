import { Type, type Static } from "@sinclair/typebox";
import { Uuid } from "./ids";

/** Nom d'utilisateur : 3 à 32 caractères, lettres, chiffres, « _ », « . », « - » (comparé sans casse). */
export const Username = Type.String({ minLength: 3, maxLength: 32, pattern: "^[A-Za-z0-9_.-]+$" });

/** Contrôle volontairement simple : la vérification réelle d'une adresse passerait par un e-mail. */
export const Email = Type.String({ minLength: 3, maxLength: 254, pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" });

/** 8 caractères minimum ; 128 maximum pour borner le coût du hachage Argon2id. */
export const Password = Type.String({ minLength: 8, maxLength: 128 });

export const DisplayName = Type.String({ minLength: 1, maxLength: 64 });

/** Ce que les autres utilisateurs voient d'un compte (FR-02). */
export const PublicUser = Type.Object(
  {
    id: Uuid,
    username: Type.String(),
    displayName: Type.String(),
  },
  { additionalProperties: false, $id: "PublicUser" },
);
export type PublicUser = Static<typeof PublicUser>;

/** Le compte vu par son propriétaire : ajoute l'e-mail. */
export const Me = Type.Object(
  {
    id: Uuid,
    username: Type.String(),
    displayName: Type.String(),
    email: Type.String(),
  },
  { additionalProperties: false, $id: "Me" },
);
export type Me = Static<typeof Me>;

/** POST /api/v1/auth/register */
export const RegisterRequest = Type.Object(
  { username: Username, email: Email, password: Password, displayName: DisplayName },
  { additionalProperties: false },
);
export type RegisterRequest = Static<typeof RegisterRequest>;

/** POST /api/v1/auth/login */
export const LoginRequest = Type.Object(
  // Pas de règle de format ici : un identifiant mal formé échoue comme un mauvais mot de passe.
  { username: Type.String({ minLength: 1, maxLength: 64 }), password: Type.String({ minLength: 1, maxLength: 128 }) },
  { additionalProperties: false },
);
export type LoginRequest = Static<typeof LoginRequest>;

/**
 * Réponse de register, login et refresh. L'access token est un JWT à garder en mémoire
 * (jamais dans localStorage) ; le refresh token voyage seulement en cookie httpOnly (architecture § 6.1).
 */
export const AuthResponse = Type.Object(
  {
    accessToken: Type.String(),
    /** Durée de vie de l'access token, en secondes. */
    expiresIn: Type.Integer({ minimum: 1 }),
    user: Me,
  },
  { additionalProperties: false, $id: "AuthResponse" },
);
export type AuthResponse = Static<typeof AuthResponse>;

/** Nom et chemin du cookie de refresh : envoyé uniquement aux routes d'authentification. */
export const REFRESH_COOKIE = { name: "chatisen_refresh", path: "/api/v1/auth" } as const;

/** GET /api/v1/auth/providers : fournisseurs de connexion activés sur ce déploiement (ADR-0020). */
export const AuthProviders = Type.Object(
  { password: Type.Literal(true), microsoft: Type.Boolean() },
  { additionalProperties: false, $id: "AuthProviders" },
);
export type AuthProviders = Static<typeof AuthProviders>;

/**
 * Raisons d'échec de la connexion Microsoft, renvoyées au client dans `?authError=` après la
 * redirection (le callback est une navigation du navigateur, pas un appel JSON).
 */
export const MICROSOFT_LOGIN_ERRORS = [
  /** L'utilisateur a annulé ou refusé le consentement chez Microsoft. */
  "MICROSOFT_DENIED",
  /** État, nonce, échange du code ou jeton ID invalide ; tentative expirée. */
  "MICROSOFT_FAILED",
  /** Tenant Microsoft hors de la liste autorisée par le déploiement. */
  "MICROSOFT_TENANT_NOT_ALLOWED",
  /** Le jeton ne porte aucune adresse utilisable pour créer le compte. */
  "MICROSOFT_EMAIL_MISSING",
  /** Un compte local a cette adresse mais Microsoft ne garantit pas qu'elle appartient à l'utilisateur. */
  "MICROSOFT_ACCOUNT_EXISTS",
] as const;
export type MicrosoftLoginError = (typeof MICROSOFT_LOGIN_ERRORS)[number];

/** Cookie temporaire (état, nonce, vérificateur PKCE) entre le départ vers Microsoft et le retour. */
export const MICROSOFT_FLOW_COOKIE = { name: "chatisen_oidc", path: "/api/v1/auth/microsoft" } as const;
