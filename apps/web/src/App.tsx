import { useEffect, useState } from "preact/hooks";
import styles from "./App.module.css";
import { checkApiHealth, type ApiHealth } from "./lib/health";

const HEALTH_LABEL: Record<ApiHealth, string> = {
  checking: "API : vérification…",
  up: "API : opérationnelle",
  down: "API : injoignable",
};

type Theme = "light" | "dark";

/** Page d'accueil provisoire du squelette : montre les tokens et que le web joint l'API. */
export function App() {
  const [health, setHealth] = useState<ApiHealth>("checking");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let cancelled = false;
    void checkApiHealth().then((result) => {
      if (!cancelled) setHealth(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const badgeClass = [styles.badge, health === "up" && styles.up, health === "down" && styles.down]
    .filter(Boolean)
    .join(" ");

  return (
    <main class={styles.page}>
      <section class={styles.card}>
        <div class={styles.brand}>
          <span class={styles.logo} aria-hidden="true">
            C
          </span>
          <h1 class={styles.title}>ChatISEN</h1>
        </div>
        <p class={styles.lead}>Messagerie, appels voix et visio. L'application arrive bientôt.</p>
        <div class={styles.footer}>
          <span class={badgeClass} role="status">
            {HEALTH_LABEL[health]}
          </span>
          <button
            type="button"
            class={styles.themeToggle}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            Thème {theme === "light" ? "sombre" : "clair"}
          </button>
        </div>
      </section>
    </main>
  );
}
