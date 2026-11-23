import { Value } from "@sinclair/typebox/value";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthResponse, ErrorResponse } from "@chatisen/shared";
import { createTestApp, refreshCookieOf, registerUser, type TestApp } from "../../test/app";
import { hashRefreshToken, TokenService } from "./tokens";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.close();
});

const refresh = (token: string) =>
  t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", cookies: { chatisen_refresh: token } });

describe("POST /auth/register", () => {
  it("crée le compte, renvoie un access token et pose le cookie de refresh", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: "alice_reg", email: "alice.reg@example.test", password: "correct horse", displayName: "Alice" },
    });
    expect(res.statusCode).toBe(201);
    expect(Value.Check(AuthResponse, res.json())).toBe(true);
    expect(res.json().user).toMatchObject({ username: "alice_reg", displayName: "Alice" });

    const cookie = res.cookies.find((c) => c.name === "chatisen_refresh");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/api/v1/auth" });

    const stored = await t.testDb.db.selectFrom("users").select("password_hash").where("username", "=", "alice_reg").executeTakeFirstOrThrow();
    expect(stored.password_hash).toMatch(/^\$argon2id\$/);
  });

  it("refuse un nom déjà pris, sans tenir compte de la casse", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: "ALICE_REG", email: "other@example.test", password: "correct horse", displayName: "A" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("USERNAME_TAKEN");
  });

  it("refuse une adresse déjà utilisée", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: "someone_else", email: "Alice.Reg@example.test", password: "correct horse", displayName: "A" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("EMAIL_TAKEN");
  });

  it("valide le corps de la requête", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: "x", email: "pas-une-adresse", password: "court", displayName: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(Value.Check(ErrorResponse, res.json())).toBe(true);
    expect(res.json().error.code).toBe("VALIDATION_FAILED");
  });
});

describe("POST /auth/login", () => {
  it("connecte avec le bon mot de passe", async () => {
    const u = await registerUser(t.app, "login");
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: u.user.username, password: u.password },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(u.user.id);
    expect(refreshCookieOf(res)).toBeDefined();
  });

  it("répond la même erreur pour un mauvais mot de passe et un compte inconnu", async () => {
    const u = await registerUser(t.app, "login");
    const wrongPassword = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: u.user.username, password: "mauvais mot de passe" },
    });
    const unknownUser = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "nobody_here", password: "peu importe" },
    });
    for (const res of [wrongPassword, unknownUser]) {
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatchObject({ code: "INVALID_CREDENTIALS", message: "Identifiant ou mot de passe incorrect" });
    }
  });
});

describe("GET /users/me", () => {
  it("renvoie le compte avec un access token valide", async () => {
    const u = await registerUser(t.app, "me");
    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: { authorization: `Bearer ${u.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(u.user);
  });

  it("refuse une requête sans token", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/users/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("refuse un token signé avec une autre clé", async () => {
    const forged = await new TokenService("x".repeat(48), 900).signAccessToken(crypto.randomUUID(), crypto.randomUUID());
    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("refuse un token expiré", async () => {
    const tokens = new TokenService(t.config.JWT_SECRET, 900);
    const expired = await tokens.signAccessToken(crypto.randomUUID(), crypto.randomUUID());
    // Vérification avec une horloge 16 minutes plus tard.
    const later = new Date(Date.now() + 16 * 60 * 1000);
    await expect(tokens.verifyAccessToken(expired, later)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("POST /auth/refresh", () => {
  it("échange le refresh token contre de nouveaux tokens (rotation)", async () => {
    const u = await registerUser(t.app, "refresh");
    const res = await refresh(u.refreshToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(u.user.id);
    const rotated = refreshCookieOf(res);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(u.refreshToken);
    expect((await refresh(rotated!)).statusCode).toBe(200);
  });

  it("détecte la réutilisation d'un refresh token et révoque toute la famille", async () => {
    const u = await registerUser(t.app, "reuse");
    const first = await refresh(u.refreshToken);
    const legitimate = refreshCookieOf(first)!;

    // Un attaquant rejoue l'ancien token, au-delà de la fenêtre de grâce : refusé…
    await t.testDb.db
      .updateTable("sessions")
      .set({ revoked_at: new Date(Date.now() - 60_000) })
      .where("refresh_token_hash", "=", hashRefreshToken(u.refreshToken))
      .execute();
    const replay = await refresh(u.refreshToken);
    expect(replay.statusCode).toBe(401);
    // …et le token légitime, de la même famille, ne marche plus non plus.
    expect((await refresh(legitimate)).statusCode).toBe(401);
  });

  it("deux refresh simultanés ne déconnectent pas l'utilisateur (#72)", async () => {
    const u = await registerUser(t.app, "race");
    const [r1, r2] = await Promise.all([refresh(u.refreshToken), refresh(u.refreshToken)]);
    const statuses = [r1.statusCode, r2.statusCode].sort();
    expect(statuses).toEqual([200, 401]);
    const winner = r1.statusCode === 200 ? r1 : r2;
    const loser = r1.statusCode === 200 ? r2 : r1;
    // La réponse perdante n'efface pas le cookie posé par la gagnante…
    expect(loser.cookies.find((c) => c.name === "chatisen_refresh")).toBeUndefined();
    // …et le nouveau token reste utilisable : la famille n'a pas été révoquée.
    expect((await refresh(refreshCookieOf(winner)!)).statusCode).toBe(200);
  });

  it("rejouer un token tout juste consommé ne révoque pas la famille (fenêtre de grâce)", async () => {
    const u = await registerUser(t.app, "grace");
    const first = await refresh(u.refreshToken);
    expect((await refresh(u.refreshToken)).statusCode).toBe(401);
    expect((await refresh(refreshCookieOf(first)!)).statusCode).toBe(200);
  });

  it("refuse une requête sans cookie", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh" });
    expect(res.statusCode).toBe(401);
  });

  it("ne stocke que l'empreinte du refresh token", async () => {
    const u = await registerUser(t.app, "hash");
    const rows = await t.testDb.db.selectFrom("sessions").select("refresh_token_hash").execute();
    expect(rows.some((r) => r.refresh_token_hash === u.refreshToken)).toBe(false);
  });
});

describe("POST /auth/logout", () => {
  it("révoque la session et efface le cookie", async () => {
    const u = await registerUser(t.app, "logout");
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      cookies: { chatisen_refresh: u.refreshToken },
    });
    expect(res.statusCode).toBe(204);
    expect(refreshCookieOf(res)).toBeUndefined();
    expect((await refresh(u.refreshToken)).statusCode).toBe(401);
  });
});
