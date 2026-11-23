import { Value } from "@sinclair/typebox/value";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ErrorResponse } from "@chatisen/shared";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createTestDb, type TestDb } from "./test/db";

/** Issue #60 : chaque statut 4xx sort avec son code, au format unique, sans détail interne. */
let testDb: TestDb;
let app: ReturnType<typeof buildApp>;

beforeAll(async () => {
  testDb = await createTestDb();
  app = buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { db: testDb.db });
  // Routes de test qui lèvent une erreur Fastify brute, comme le ferait un plugin (rate limit, auth…).
  app.get("/test/status/:status", async (request) => {
    const status = Number((request.params as { status: string }).status);
    throw Object.assign(new Error("détail interne à ne pas exposer"), { statusCode: status });
  });
  app.post("/test/echo", async (request) => request.body);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testDb.drop();
});

describe("correspondance statut → code d'erreur", () => {
  it.each([
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [409, "VALIDATION_FAILED"],
    [400, "VALIDATION_FAILED"],
  ])("%i → %s", async (status, code) => {
    const res = await app.inject({ method: "GET", url: `/test/status/${status}` });
    expect(res.statusCode).toBe(status);
    const body = res.json();
    expect(Value.Check(ErrorResponse, body)).toBe(true);
    expect(body.error.code).toBe(code);
    expect(body.error.message).not.toContain("détail interne");
  });

  it("une erreur 5xx sort en INTERNAL_ERROR, sans détail", async () => {
    const res = await app.inject({ method: "GET", url: "/test/status/503" });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toMatchObject({ code: "INTERNAL_ERROR", message: "Erreur interne du serveur" });
  });

  it("un JSON malformé donne 400 VALIDATION_FAILED sans le message brut du parseur", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/test/echo",
      headers: { "content-type": "application/json" },
      payload: '{"oops":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: "VALIDATION_FAILED", message: "Requête invalide" });
  });

  it("une route protégée sans token donne 401 UNAUTHENTICATED", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/conversations" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });
});
