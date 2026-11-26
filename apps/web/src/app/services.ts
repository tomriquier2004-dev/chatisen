import { useEffect, useState } from "preact/hooks";
import { ApiClient, type Session } from "../lib/api";
import { Realtime } from "../lib/socket";
import { CallClient } from "../features/calls/callClient";
import { browserThemeEnv, createThemeStore } from "../lib/theme";

/** Services uniques de l'application : un client API et une connexion temps réel par onglet. */
export const api = new ApiClient();
export const realtime = new Realtime(api);
/** Client WebRTC unique, abonné aux sonneries même lorsque l'utilisateur change d'écran. */
export const calls = new CallClient({ api, socket: realtime.socket });
/** Thème appliqué dès l'import, avant le premier rendu : pas de bascule visible au chargement. */
export const theme = createThemeStore(browserThemeEnv());

/** Session courante, mise à jour à la connexion, au refresh et à la déconnexion. */
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(api.current);
  useEffect(() => api.subscribe(setSession), []);
  return session;
}

/** Déconnexion : révoque la session côté serveur, puis ferme la socket. */
export async function signOut(): Promise<void> {
  try {
    await api.logout();
  } finally {
    realtime.disconnect();
  }
}
