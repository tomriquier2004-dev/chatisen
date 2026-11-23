import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, registerUser, type TestApp } from "../test/app";
import { TEST_REDIS_URL } from "../test/realtime";
import { MemoryRateLimiter, RATE_RULES, RedisRateLimiter } from "./rate-limit";

/** Issue #71 : limites sur l'authentification et la recherche, 429 RATE_LIMITED + Retry-After. */
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ RATE_LIMIT_ENABLED: "true" });
});

afterAll(async () => {
  await t.close();
});

// Chaque test utilise ses propres adresses, pour que les compteurs ne se mélangent pas.
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

const login = (username: string, remoteAddress: string) =>
  t.app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress,
    payload: { username, password: "mauvais mot de passe" },
  });

describe("POST /auth/login", () => {
  it(`bloque un compte après ${RATE_RULES.loginPerAccount.limit} essais, même depuis des adresses différentes`, async () => {
    const username = `victim_${randomUUID().slice(0, 8)}`;
    for (let i = 0; i < RATE_RULES.loginPerAccount.limit; i++) {
      expect((await login(username, ip())).statusCode).toBe(401);
    }
    const blocked = await login(username.toUpperCase(), ip());
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it(`bloque une adresse après ${RATE_RULES.loginPerIp.limit} essais sur des comptes différents`, async () => {
    const address = ip();
    for (let i = 0; i < RATE_RULES.loginPerIp.limit; i++) {
      expect((await login(`spray_${randomUUID().slice(0, 8)}`, address)).statusCode).toBe(401);
    }
    expect((await login(`spray_${randomUUID().slice(0, 8)}`, address)).statusCode).toBe(429);
    // Une autre adresse n'est pas touchée.
    expect((await login(`spray_${randomUUID().slice(0, 8)}`, ip())).statusCode).toBe(401);
  });
});

describe("POST /auth/register", () => {
  it(`bloque une adresse après ${RATE_RULES.registerPerIp.limit} inscriptions`, async () => {
    const address = ip();
    const register = () => {
      const s = randomUUID().slice(0, 8);
      return t.app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        remoteAddress: address,
        payload: { username: `u_${s}`, email: `${s}@example.test`, password: "correct horse", displayName: "U" },
      });
    };
    for (let i = 0; i < RATE_RULES.registerPerIp.limit; i++) expect((await register()).statusCode).toBe(201);
    expect((await register()).statusCode).toBe(429);
  });
});

describe("GET /users?query=", () => {
  it(`bloque un utilisateur après ${RATE_RULES.userSearchPerUser.limit} recherches par minute`, async () => {
    // Inscription depuis une adresse dédiée, pour ne pas toucher la limite d'inscription.
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      remoteAddress: ip(),
      payload: { username: `searcher_${randomUUID().slice(0, 6)}`, email: `${randomUUID()}@example.test`, password: "correct horse", displayName: "S" },
    });
    const token = res.json().accessToken as string;
    const search = () =>
      t.app.inject({ method: "GET", url: "/api/v1/users?query=ab", headers: { authorization: `Bearer ${token}` } });
    for (let i = 0; i < RATE_RULES.userSearchPerUser.limit; i++) expect((await search()).statusCode).toBe(200);
    expect((await search()).statusCode).toBe(429);
  });
});

describe("désactivation", () => {
  it("RATE_LIMIT_ENABLED=false n'applique aucune limite", async () => {
    const off = await createTestApp({ RATE_LIMIT_ENABLED: "false" });
    try {
      for (let i = 0; i < RATE_RULES.loginPerAccount.limit + 2; i++) {
        expect((await off.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "x_off", password: "y" } })).statusCode).toBe(401);
      }
      await registerUser(off.app);
    } finally {
      await off.close();
    }
  });
});

describe("compteurs", () => {
  it("la fenêtre en mémoire se réinitialise après sa durée", async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(() => now);
    expect((await limiter.hit("k", 1, 1000)).allowed).toBe(true);
    expect((await limiter.hit("k", 1, 1000)).allowed).toBe(false);
    now = 1001;
    expect((await limiter.hit("k", 1, 1000)).allowed).toBe(true);
  });

  it("les compteurs Redis sont partagés entre instances et expirent", async () => {
    const c1 = createClient({ url: TEST_REDIS_URL });
    const c2 = createClient({ url: TEST_REDIS_URL });
    await Promise.all([c1.connect(), c2.connect()]);
    try {
      const prefix = `test:${randomUUID()}:`;
      const instanceA = new RedisRateLimiter(c1, prefix);
      const instanceB = new RedisRateLimiter(c2, prefix);
      expect((await instanceA.hit("k", 2, 300)).allowed).toBe(true);
      expect((await instanceB.hit("k", 2, 300)).allowed).toBe(true);
      const third = await instanceA.hit("k", 2, 300);
      expect(third.allowed).toBe(false);
      expect(third.retryAfterMs).toBeGreaterThan(0);
      await new Promise((r) => setTimeout(r, 350));
      expect((await instanceB.hit("k", 2, 300)).allowed).toBe(true);
    } finally {
      await Promise.all([c1.quit(), c2.quit()]);
    }
  });
});
