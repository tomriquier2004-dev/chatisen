import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, registerUser, type TestApp } from "../../test/app";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({
    RATE_LIMIT_ENABLED: "true",
    TURN_SHARED_SECRET: "x".repeat(48),
    TURN_URLS: "stun:stun.example.test:3478,turn:turn.example.test:3478?transport=udp",
    TURN_CREDENTIAL_TTL_SECONDS: "3600",
  });
});

afterAll(async () => {
  await t.close();
});

describe("GET /turn/credentials (FR-09, NFR-04)", () => {
  it("requires an authenticated user", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/turn/credentials" });
    expect(res.statusCode).toBe(401);
  });

  it("returns a per-user expiring username and a coturn HMAC-SHA1 credential", async () => {
    const user = await registerUser(t.app, "turn");
    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/turn/credentials",
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.urls).toEqual([
      "stun:stun.example.test:3478",
      "turn:turn.example.test:3478?transport=udp",
    ]);
    expect(body.ttl).toBe(3600);
    const [expiration, userId] = body.username.split(":");
    expect(userId).toBe(user.user.id);
    expect(Number(expiration)).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(Number(expiration)).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 3600);
    expect(body.credential).toBe(createHmac("sha1", "x".repeat(48)).update(body.username).digest("base64"));
    expect(body).not.toHaveProperty("secret");
    expect(JSON.stringify(body)).not.toContain("x".repeat(48));
  });

  it("limits credential issuance per authenticated user", async () => {
    const user = await registerUser(t.app, "turn-rate");
    const headers = { authorization: `Bearer ${user.accessToken}` };
    for (let i = 0; i < 10; i++) {
      expect((await t.app.inject({ method: "GET", url: "/api/v1/turn/credentials", headers })).statusCode).toBe(200);
    }
    const limited = await t.app.inject({ method: "GET", url: "/api/v1/turn/credentials", headers });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
  });
});
