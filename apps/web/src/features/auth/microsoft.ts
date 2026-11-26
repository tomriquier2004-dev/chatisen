import { API_PREFIX, MICROSOFT_LOGIN_ERRORS, type MicrosoftLoginError } from "@chatisen/shared";

/** Départ vers Microsoft : une navigation complète (pas un fetch), le serveur redirige (ADR-0020). */
export const MICROSOFT_START_URL = `${API_PREFIX}/auth/microsoft/start`;

const MESSAGES: Record<MicrosoftLoginError, string> = {
  MICROSOFT_DENIED: "Connexion Microsoft annulée.",
  MICROSOFT_FAILED: "La connexion Microsoft a échoué. Réessayez.",
  MICROSOFT_TENANT_NOT_ALLOWED: "Ce compte Microsoft n'est pas accepté sur ChatISEN.",
  MICROSOFT_EMAIL_MISSING: "Votre compte Microsoft ne fournit pas d'adresse e-mail.",
  MICROSOFT_ACCOUNT_EXISTS:
    "Un compte ChatISEN utilise déjà cette adresse. Connectez-vous avec votre nom d'utilisateur et votre mot de passe.",
};

/** Message à afficher pour le `?authError=` du retour de Microsoft, ou null s'il est absent ou inconnu. */
export function microsoftErrorMessage(search: string): string | null {
  const code = new URLSearchParams(search).get("authError");
  return code && (MICROSOFT_LOGIN_ERRORS as readonly string[]).includes(code) ? MESSAGES[code as MicrosoftLoginError] : null;
}

/** Lit puis retire `?authError=` de l'adresse, pour qu'un rechargement ne réaffiche pas l'erreur. */
export function takeMicrosoftError(): string | null {
  if (typeof window === "undefined") return null;
  const message = microsoftErrorMessage(window.location.search);
  if (new URLSearchParams(window.location.search).has("authError")) {
    const url = new URL(window.location.href);
    url.searchParams.delete("authError");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  return message;
}
