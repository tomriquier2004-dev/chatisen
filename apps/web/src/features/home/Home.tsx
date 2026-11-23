import { useState } from "preact/hooks";
import type { Session } from "../../lib/api";
import { signOut } from "../../app/services";
import styles from "../auth/Auth.module.css";

/** Écran provisoire une fois connecté ; remplacé par la messagerie (#79, #80). */
export function Home({ session }: { session: Session }) {
  const [busy, setBusy] = useState(false);
  return (
    <main class={styles.page}>
      <section class={styles.card} aria-labelledby="home-title">
        <h1 id="home-title" class={styles.title}>
          Bonjour {session.user.displayName}
        </h1>
        <p class={styles.hint}>Connecté en tant que @{session.user.username}.</p>
        <button
          class={styles.primary}
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void signOut().finally(() => setBusy(false));
          }}
        >
          {busy ? "Déconnexion…" : "Se déconnecter"}
        </button>
      </section>
    </main>
  );
}
