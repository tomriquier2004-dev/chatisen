import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, microsoftConfig, secureCookies } from "./config";

describe("loadConfig", () => {
  it("applique les valeurs par défaut de développement", () => {
    const config = loadConfig({});
    expect(config.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(config).toEqual({
      JWT_SECRET: config.JWT_SECRET,
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      TURN_CREDENTIAL_TTL_SECONDS: 3600,
      CALL_RING_TIMEOUT_SECONDS: 30,
      CALL_DISCONNECT_GRACE_SECONDS: 10,
      NODE_ENV: "development",
      API_HOST: "127.0.0.1",
      API_PORT: 3000,
      LOG_LEVEL: "info",
      DATABASE_URL: "postgres://chatisen:chatisen-dev@127.0.0.1:5432/chatisen",
      DATABASE_POOL_SIZE: 10,
      REDIS_URL: "redis://127.0.0.1:6379",
      RATE_LIMIT_ENABLED: true,
      TRUST_PROXY: false,
      MICROSOFT_TENANT: "common",
      devDefaultsUsed: ["DATABASE_URL", "JWT_SECRET", "REDIS_URL"],
    });
  });

  it("convertit le port en nombre", () => {
    expect(loadConfig({ API_PORT: "8080" }).API_PORT).toBe(8080);
  });

  it("refuse un port invalide", () => {
    expect(() => loadConfig({ API_PORT: "99999" })).toThrow(ConfigError);
    expect(() => loadConfig({ API_PORT: "abc" })).toThrow(ConfigError);
  });

  it("refuse un niveau de log inconnu", () => {
    expect(() => loadConfig({ LOG_LEVEL: "verbose" })).toThrow(ConfigError);
  });

  it("exige DATABASE_URL et JWT_SECRET en production, sans valeur par défaut", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/JWT_SECRET/);
  });

  it("refuse une clé JWT trop courte", () => {
    expect(() => loadConfig({ JWT_SECRET: "court" })).toThrow(/JWT_SECRET/);
  });

  describe("serveur exposé sans NODE_ENV=production (issue #73)", () => {
    const explicit = {
      JWT_SECRET: "x".repeat(48),
      DATABASE_URL: "postgres://chatisen:secret@db:5432/chatisen",
      TURN_SHARED_SECRET: "turn-secret-".repeat(4),
      TURN_URLS: "turn:turn.example.test:3478?transport=udp",
    };

    it("refuse de démarrer sur une adresse non locale avec la clé JWT ou la base de développement", () => {
      expect(() => loadConfig({ API_HOST: "0.0.0.0" })).toThrow(/API_HOST=0.0.0.0.*DATABASE_URL et JWT_SECRET/);
      expect(() => loadConfig({ API_HOST: "0.0.0.0", JWT_SECRET: explicit.JWT_SECRET })).toThrow(/DATABASE_URL/);
      expect(() => loadConfig({ API_HOST: "0.0.0.0", DATABASE_URL: explicit.DATABASE_URL })).toThrow(/JWT_SECRET/);
    });

    it("démarre sur une adresse non locale quand les valeurs sensibles sont fournies", () => {
      expect(loadConfig({ API_HOST: "0.0.0.0", ...explicit }).API_HOST).toBe("0.0.0.0");
    });

    it("refuse un secret TURN absent ou de développement sur un hôte exposé", () => {
      expect(() => loadConfig({ API_HOST: "0.0.0.0", ...explicit, TURN_SHARED_SECRET: undefined })).toThrow(/TURN_SHARED_SECRET/);
      expect(() => loadConfig({ API_HOST: "0.0.0.0", ...explicit, TURN_SHARED_SECRET: "development".repeat(3) })).toThrow(/TURN_SHARED_SECRET/);
    });

    it("garde les valeurs de développement sur une adresse locale", () => {
      for (const host of ["127.0.0.1", "localhost", "::1"]) {
        expect(loadConfig({ API_HOST: host }).devDefaultsUsed).toContain("JWT_SECRET");
      }
    });
  });

  describe("cookie Secure", () => {
    const explicit = {
      JWT_SECRET: "x".repeat(48),
      DATABASE_URL: "postgres://u:p@db/x",
      TURN_SHARED_SECRET: "turn-secret-".repeat(4),
      TURN_URLS: "turn:turn.example.test:3478",
    };

    it("est désactivé seulement en development ou test sur une adresse locale", () => {
      expect(secureCookies(loadConfig({}))).toBe(false);
      expect(secureCookies(loadConfig({ NODE_ENV: "test" }))).toBe(false);
    });

    it("est activé en production, et sur une adresse exposée même si NODE_ENV a été oublié", () => {
      expect(secureCookies(loadConfig({ NODE_ENV: "production", ...explicit }))).toBe(true);
      expect(secureCookies(loadConfig({ API_HOST: "0.0.0.0", ...explicit }))).toBe(true);
    });

    it("COOKIE_SECURE l'emporte quand il est fourni", () => {
      expect(secureCookies(loadConfig({ COOKIE_SECURE: "true" }))).toBe(true);
      expect(secureCookies(loadConfig({ NODE_ENV: "production", COOKIE_SECURE: "false", ...explicit }))).toBe(false);
    });
  });

  it("ne répète pas la valeur fautive dans le message d'erreur", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://user:s3cret@db/x" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("s3cret") }),
    );
  });

  describe("connexion Microsoft (ADR-0020)", () => {
    const ms = {
      MICROSOFT_CLIENT_ID: "11111111-2222-3333-4444-555555555555",
      MICROSOFT_CLIENT_SECRET: "not-a-real-secret",
      MICROSOFT_REDIRECT_URI: "https://chatisen.example/api/v1/auth/microsoft/callback",
    };

    it("est désactivée sans configuration", () => {
      expect(microsoftConfig(loadConfig({}))).toBeNull();
    });

    it("est activée avec les trois variables, autorité common par défaut", () => {
      expect(microsoftConfig(loadConfig(ms))).toEqual({
        clientId: ms.MICROSOFT_CLIENT_ID,
        clientSecret: ms.MICROSOFT_CLIENT_SECRET,
        redirectUri: ms.MICROSOFT_REDIRECT_URI,
        tenant: "common",
      });
    });

    it("refuse une configuration partielle sans répéter le secret", () => {
      const partial = { MICROSOFT_CLIENT_ID: ms.MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET: ms.MICROSOFT_CLIENT_SECRET };
      expect(() => loadConfig(partial)).toThrow(/MICROSOFT_REDIRECT_URI/);
      expect(() => loadConfig(partial)).toThrow(expect.objectContaining({ message: expect.not.stringContaining("not-a-real-secret") }));
    });

    it("refuse une URI de redirection qui ne pointe pas vers le callback", () => {
      expect(() => loadConfig({ ...ms, MICROSOFT_REDIRECT_URI: "https://evil.example/" })).toThrow(ConfigError);
    });

    it("lit la liste de tenants autorisés", () => {
      const tenants = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE,9188040d-6c67-4c5b-b112-36a304b66dad";
      expect(microsoftConfig(loadConfig({ ...ms, MICROSOFT_ALLOWED_TENANTS: tenants }))?.allowedTenants).toEqual([
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "9188040d-6c67-4c5b-b112-36a304b66dad",
      ]);
      expect(() => loadConfig({ ...ms, MICROSOFT_ALLOWED_TENANTS: "isen.fr" })).toThrow(ConfigError);
    });
  });
});
