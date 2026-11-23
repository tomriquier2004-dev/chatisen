import { useEffect, useState } from "preact/hooks";
import { theme } from "../../app/services";
import { THEME_PREFERENCES, type ThemePreference } from "../../lib/theme";
import styles from "./ThemeToggle.module.css";

const LABEL: Record<ThemePreference, string> = {
  system: "Système",
  light: "Clair",
  dark: "Sombre",
};

/**
 * Choix du thème : suivre le système, ou forcer clair ou sombre (design system § 2.4).
 * Groupe de boutons radio : le choix courant est annoncé par les lecteurs d'écran.
 */
export function ThemeToggle({ class: className }: { class?: string }) {
  const [preference, setPreference] = useState<ThemePreference>(theme.get().preference);
  useEffect(() => theme.subscribe((s) => setPreference(s.preference)), []);

  return (
    <div role="radiogroup" aria-label="Thème de l'interface" class={className ? `${styles.toggle} ${className}` : styles.toggle}>
      {THEME_PREFERENCES.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={preference === p}
          class={preference === p ? `${styles.option} ${styles.selected}` : styles.option}
          onClick={() => theme.set(p)}
        >
          {LABEL[p]}
        </button>
      ))}
    </div>
  );
}
