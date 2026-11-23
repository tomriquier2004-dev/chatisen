import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config";

describe("loadConfig", () => {
  it("applique les valeurs par défaut", () => {
    expect(loadConfig({})).toEqual({
      NODE_ENV: "development",
      API_HOST: "127.0.0.1",
      API_PORT: 3000,
      LOG_LEVEL: "info",
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
});
