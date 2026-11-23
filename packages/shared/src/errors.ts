import { Type, type Static } from "@sinclair/typebox";

/**
 * Codes d'erreur de l'API (docs/architecture.md § 5.1, FR-18).
 * Union fermée : le client peut afficher un message précis pour chaque code.
 * Les codes métier (CONVERSATION_FORBIDDEN, etc.) s'ajoutent avec leur fonctionnalité.
 */
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "USERNAME_TAKEN",
  "EMAIL_TAKEN",
  "INVALID_CREDENTIALS",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export const ErrorCode = Type.Union(ERROR_CODES.map((code) => Type.Literal(code)));
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Format d'erreur unique, pour le REST comme pour les acks Socket.IO. */
export const ErrorResponse = Type.Object(
  {
    error: Type.Object(
      {
        code: ErrorCode,
        message: Type.String(),
        requestId: Type.String(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false, $id: "ErrorResponse" },
);
export type ErrorResponse = Static<typeof ErrorResponse>;
