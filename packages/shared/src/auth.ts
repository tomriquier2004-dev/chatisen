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
