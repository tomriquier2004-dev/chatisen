import { Value } from "@sinclair/typebox/value";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ErrorResponse, HealthLiveResponse } from "@chatisen/shared";
import { buildApp } from "./app";
import { loadConfig } from "./config";

const app = buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }));

beforeAll(() => app.ready());
afterAll(() => app.close());

describe("GET /api/v1/health/live", () => {
  it("répond 200 selon le contrat partagé", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(res.statusCode).toBe(200);
    expect(Value.Check(HealthLiveResponse, res.json())).toBe(true);
  });
});

describe("format d'erreur", () => {
  it("renvoie NOT_FOUND au format unique pour une route inconnue", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/nope" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(Value.Check(ErrorResponse, body)).toBe(true);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
