import type { ErrorCode } from "@chatisen/shared";

/** Erreur métier : le gestionnaire d'erreurs la convertit au format unique (architecture § 5.1). */
export class AppError extends Error {
  override name = "AppError";

  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const unauthenticated = (message = "Authentification requise") =>
  new AppError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "Action non autorisée") => new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Ressource introuvable") => new AppError(404, "NOT_FOUND", message);
