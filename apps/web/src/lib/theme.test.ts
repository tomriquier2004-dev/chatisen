import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, createThemeStore, parsePreference, resolveTheme, type ThemeEnv } from "./theme";

function fakeEnv(options: { stored?: string; systemDark?: boolean; brokenStorage?: boolean } = {}) {
  const values = new Map<string, string>();
  if (options.stored !== undefined) values.set(THEME_STORAGE_KEY, options.stored);
  const broken = () => {
    throw new Error("SecurityError");
  };
  let onChange: (() => void) | undefined;
  const attributes: Record<string, string> = {};
  const media = { matches: options.systemDark ?? false, addEventListener: (_: string, cb: () => void) => (onChange = cb) };
  const env: ThemeEnv = {
    storage: options.brokenStorage
      ? { getItem: broken, setItem: broken, removeItem: broken }
      : {
          getItem: (k) => values.get(k) ?? null,
          setItem: (k, v) => void values.set(k, v),
          removeItem: (k) => void values.delete(k),
        },
    media: media as unknown as ThemeEnv["media"],
    root: { setAttribute: (name, value) => void (attributes[name] = value) },
  };
  const setSystemDark = (dark: boolean) => {
    media.matches = dark;
    onChange?.();
  };
  return { env, values, attributes, setSystemDark };
}

describe("parsePreference / resolveTheme", () => {
  it("revient au réglage système pour une valeur absente ou inconnue", () => {
    expect(parsePreference(null)).toBe("system");
    expect(parsePreference("violet")).toBe("system");
    expect(parsePreference("dark")).toBe("dark");
  });

  it("suit le système seulement quand rien n'est forcé", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("createThemeStore", () => {
  it("applique le réglage système par défaut", () => {
    const { env, attributes } = fakeEnv({ systemDark: true });
    const store = createThemeStore(env);
    expect(store.get()).toEqual({ preference: "system", theme: "dark" });
    expect(attributes["data-theme"]).toBe("dark");
  });

  it("restaure le choix mémorisé au chargement", () => {
    const { env, attributes } = fakeEnv({ stored: "light", systemDark: true });
    createThemeStore(env);
    expect(attributes["data-theme"]).toBe("light");
  });

  it("mémorise un thème forcé et l'oublie au retour au système", () => {
    const { env, values, attributes } = fakeEnv();
    const store = createThemeStore(env);
    store.set("dark");
    expect(values.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(attributes["data-theme"]).toBe("dark");
    store.set("system");
    expect(values.has(THEME_STORAGE_KEY)).toBe(false);
    expect(attributes["data-theme"]).toBe("light");
  });

  it("suit un changement du réglage système, sauf si un thème est forcé", () => {
    const { env, attributes, setSystemDark } = fakeEnv();
    const store = createThemeStore(env);
    const seen: string[] = [];
    store.subscribe((s) => seen.push(s.theme));
    setSystemDark(true);
    expect(attributes["data-theme"]).toBe("dark");
    store.set("light");
    setSystemDark(false);
    setSystemDark(true);
    expect(attributes["data-theme"]).toBe("light");
    expect(seen).toEqual(["dark", "light"]);
  });

  it("fonctionne sans stockage utilisable (navigation privée)", () => {
    const { env, attributes } = fakeEnv({ brokenStorage: true });
    const store = createThemeStore(env);
    expect(() => store.set("dark")).not.toThrow();
    expect(attributes["data-theme"]).toBe("dark");
  });
});
