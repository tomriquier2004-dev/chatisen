import type { ErrorCode } from "@chatisen/shared";

/** Codes d'erreur propres au client : l'API n'a pas pu répondre, ou a répondu hors contrat. */
export type ClientErrorCode = ErrorCode | "NETWORK_ERROR" | "INVALID_RESPONSE";

/** Un message lisible par code (FR-18). Pour la connexion, rien ne révèle si le compte existe. */
export const ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  VALIDATION_FAILED: "Certaines informations sont invalides.",
  UNAUTHENTICATED: "Votre session a expiré. Reconnectez-vous.",
  FORBIDDEN: "Vous n'avez pas le droit de faire cette action.",
  NOT_FOUND: "Élément introuvable.",
  USERNAME_TAKEN: "Ce nom d'utilisateur est déjà pris.",
  EMAIL_TAKEN: "Cette adresse e-mail est déjà utilisée.",
  INVALID_CREDENTIALS: "Identifiant ou mot de passe incorrect.",
  CONVERSATION_FORBIDDEN: "Vous ne faites pas partie de cette conversation.",
  CALL_NOT_FOUND: "Cet appel n'existe plus.",
  CALL_NOT_ACTIVE: "Cet appel n'est plus actif.",
  CALL_BUSY: "Un des participants est déjà en appel.",
  CALL_ALREADY_ENDED: "Cet appel est déjà terminé.",
  ALREADY_MEMBER: "Cette personne fait déjà partie de la conversation.",
  NOT_A_GROUP: "Les membres d'une conversation privée ne peuvent pas changer.",
  RATE_LIMITED: "Trop de tentatives. Patientez un instant puis réessayez.",
  INTERNAL_ERROR: "Le serveur a rencontré un problème. Réessayez plus tard.",
  NETWORK_ERROR: "Impossible de joindre le serveur. Vérifiez votre connexion.",
  INVALID_RESPONSE: "Réponse inattendue du serveur.",
};

/** Erreur levée par le client API ; `message` est déjà prêt à afficher. */
export class ApiError extends Error {
  override name = "ApiError";

  constructor(
    readonly code: ClientErrorCode,
    readonly status: number | undefined,
    /** Détail renvoyé par le serveur (ex. champ invalide), utile au débogage, pas forcément à afficher. */
    readonly detail?: string,
    readonly requestId?: string,
  ) {
    super(ERROR_MESSAGES[code]);
  }
}
