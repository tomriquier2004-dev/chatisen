import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config";

describe("loadConfig", () => {
  it("applique les valeurs par défaut de développement", () => {
    const config = loadConfig({});
    expect(config.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(config).toEqual({
      JWT_SECRET: config.JWT_SECRET,
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      NODE_ENV: "development",
      API_HOST: "127.0.0.1",
      API_PORT: 3000,
      LOG_LEVEL: "info",
      DATABASE_URL: "postgres://chatisen:chatisen-dev@127.0.0.1:5432/chatisen",
      DATABASE_POOL_SIZE: 10,
      REDIS_URL: "redis://127.0.0.1:6379",
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

  it("ne répète pas la valeur fautive dans le message d'erreur", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://user:s3cret@db/x" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("s3cret") }),
    );
  });
});
