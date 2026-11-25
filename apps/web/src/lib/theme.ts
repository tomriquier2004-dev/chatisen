/**
 * Thème clair / sombre (design system § 2.4).
 * Le choix de l'utilisateur est mémorisé dans le navigateur ; sans choix, l'interface suit le réglage
 * du système (`prefers-color-scheme`). Le thème actif est posé sur `<html data-theme>`, que les tokens
 * de `styles/tokens.css` lisent : aucun composant ne dépend du thème.
 */

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];
export const THEME_STORAGE_KEY = "chatisen.theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Une valeur stockée inconnue ou absente revient au réglage du système. */
export function parsePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

type ThemeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type ThemeMedia = Pick<MediaQueryList, "matches" | "addEventListener">;

export interface ThemeEnv {
  /** `null` si le stockage est indisponible (navigation privée, stockage bloqué). */
  storage: ThemeStorage | null;
  media: ThemeMedia | null;
  root: Pick<HTMLElement, "setAttribute">;
}

export interface ThemeState {
  preference: ThemePreference;
  theme: Theme;
}

export interface ThemeStore {
  get(): ThemeState;
  set(preference: ThemePreference): void;
  subscribe(listener: (state: ThemeState) => void): () => void;
}

export function createThemeStore(env: ThemeEnv): ThemeStore {
  let preference = parsePreference(safely(() => env.storage?.getItem(THEME_STORAGE_KEY)));
  const listeners = new Set<(state: ThemeState) => void>();

  const state = (): ThemeState => ({ preference, theme: resolveTheme(preference, env.media?.matches ?? false) });
  const apply = () => {
    const current = state();
    env.root.setAttribute("data-theme", current.theme);
    for (const listener of listeners) listener(current);
  };

  // Un changement du réglage système ne concerne que l'utilisateur qui n'a rien forcé.
  env.media?.addEventListener("change", () => {
    if (preference === "system") apply();
  });
  apply();

  return {
    get: state,
    set(next) {
      preference = next;
      safely(() =>
        next === "system"
          ? env.storage?.removeItem(THEME_STORAGE_KEY)
          : env.storage?.setItem(THEME_STORAGE_KEY, next),
      );
      apply();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Le stockage peut lever une exception : le choix vaut alors pour la session en cours seulement. */
function safely<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

/** Environnement du navigateur ; `localStorage` lui-même peut lever une exception à l'accès. */
export function browserThemeEnv(): ThemeEnv {
  return {
    storage: safely(() => window.localStorage),
    media: typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null,
    root: document.documentElement,
  };
}
