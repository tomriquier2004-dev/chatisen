import { Value } from "@sinclair/typebox/value";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ErrorResponse, HealthLiveResponse, HealthReadyResponse } from "@chatisen/shared";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { createTestDb, type TestDb } from "./test/db";

const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" });
let testDb: TestDb;
let app: ReturnType<typeof buildApp>;

beforeAll(async () => {
  testDb = await createTestDb();
  app = buildApp(config, { db: testDb.db });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testDb.drop();
});

describe("GET /api/v1/health/live", () => {
  it("répond 200 selon le contrat partagé", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(res.statusCode).toBe(200);
    expect(Value.Check(HealthLiveResponse, res.json())).toBe(true);
  });
});

describe("GET /api/v1/health/ready", () => {
  it("répond 200 quand Postgres est joignable", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready", checks: { postgres: "up" } });
  });

  it("répond 503 quand Postgres est injoignable", async () => {
    const deadDb = createDb("postgres://nobody:nothing@127.0.0.1:1/none", 1);
    const deadApp = buildApp(config, { db: deadDb });
    try {
      const res = await deadApp.inject({ method: "GET", url: "/api/v1/health/ready" });
      expect(res.statusCode).toBe(503);
      expect(Value.Check(HealthReadyResponse, res.json())).toBe(true);
      expect(res.json().checks.postgres).toBe("down");
    } finally {
      await deadApp.close();
      await deadDb.destroy();
    }
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


describe("GET /metrics", () => {
  it("expose les métriques d'appel au format Prometheus sans authentification publique", async () => {
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("# TYPE chatisen_calls_started_total counter");
    expect(res.body).toContain("# TYPE chatisen_call_quality_samples_total counter");
    expect(res.body).toContain("# TYPE chatisen_calls_by_ice_candidate_type gauge");
    expect(res.body).toContain("chatisen_call_duration_seconds_count");
  });
});
