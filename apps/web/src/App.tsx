import { useEffect, useState } from "preact/hooks";
import { api, realtime, useSession } from "./app/services";
import { AuthScreen } from "./features/auth/AuthScreen";
import { Home } from "./features/home/Home";

/**
 * Racine de l'application : restaure la session au chargement (cookie de refresh httpOnly),
 * puis affiche la connexion ou l'espace connecté. La socket suit la session.
 */
export function App() {
  const session = useSession();
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    void api
      .restore()
      .catch(() => null)
      .finally(() => setRestoring(false));
  }, []);

  const signedIn = session !== null;
  useEffect(() => {
    if (signedIn) realtime.connect();
    else realtime.disconnect();
  }, [signedIn]);

  if (restoring) {
    return (
      <p role="status" style={{ padding: "var(--space-8)", color: "var(--color-text-secondary)" }}>
        Chargement…
      </p>
    );
  }
  return session ? <Home session={session} /> : <AuthScreen />;
}
