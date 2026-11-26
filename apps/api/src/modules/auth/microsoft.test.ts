import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from "jose";
import { Value } from "@sinclair/typebox/value";
import type { AuthResponse } from "@chatisen/shared";
import { AuthProviders } from "@chatisen/shared";
import type { LightMyRequestResponse } from "fastify";
import { createTestApp, refreshCookieOf, registerUser, type TestApp } from "../../test/app";
import type { MicrosoftConfig } from "../../config";
import {
  CONSUMER_TENANT_ID,
  EntraIdClient,
  MicrosoftLoginError,
  codeChallenge,
  type MicrosoftClient,
  type MicrosoftIdentity,
} from "./microsoft";
import { usernameCandidate } from "./microsoft-routes";

const CLIENT_ID = "11111111-2222-3333-4444-555555555555";
const SCHOOL_TENANT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const REDIRECT_URI = "http://localhost:5173/api/v1/auth/microsoft/callback";
const MS_ENV = {
  MICROSOFT_CLIENT_ID: CLIENT_ID,
  MICROSOFT_CLIENT_SECRET: "test-secret-not-real",
  MICROSOFT_REDIRECT_URI: REDIRECT_URI,
};

describe("EntraIdClient (validation du jeton ID)", () => {
  let privateKey: CryptoKey;
  let jwks: ReturnType<typeof createLocalJWKSet>;
  const config: MicrosoftConfig = { clientId: CLIENT_ID, clientSecret: "s", redirectUri: REDIRECT_URI, tenant: "common" };

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }] });
  });

  async function idToken(overrides: JWTPayload = {}, key: CryptoKey = privateKey): Promise<string> {
    const tid = (overrides.tid as string | undefined) ?? SCHOOL_TENANT;
    return new SignJWT({
      iss: `https://login.microsoftonline.com/${tid}/v2.0`,
      aud: CLIENT_ID,
      sub: "pairwise-sub",
      tid,
      oid: "0f0f0f0f-1111-2222-3333-444444444444",
      nonce: "n-1",
      email: "Etudiant@isen.example",
      name: "Étudiant ISEN",
      ...overrides,
    })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
  }

  const client = (c: Partial<MicrosoftConfig> = {}) => new EntraIdClient({ ...config, ...c }, { jwks });

  it("accepte un jeton valide et retient tid:oid comme identifiant", async () => {
    const identity = await client().verifyIdToken(await idToken(), "n-1");
    expect(identity).toEqual({
      subject: `${SCHOOL_TENANT}:0f0f0f0f-1111-2222-3333-444444444444`,
      tenantId: SCHOOL_TENANT,
      email: "Etudiant@isen.example",
      emailVerified: false,
      name: "Étudiant ISEN",
    });
  });

  it("ne considère l'adresse vérifiée qu'avec xms_edov = true", async () => {
    expect((await client().verifyIdToken(await idToken({ xms_edov: true }), "n-1")).emailVerified).toBe(true);
    expect((await client().verifyIdToken(await idToken({ xms_edov: "true" }), "n-1")).emailVerified).toBe(false);
  });

  const rejected = async (p: Promise<unknown>, reason = "MICROSOFT_FAILED") => {
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MicrosoftLoginError);
    expect((err as MicrosoftLoginError).reason).toBe(reason);
  };

  it("refuse un nonce différent (rejeu d'un jeton)", async () => {
    await rejected(client().verifyIdToken(await idToken(), "autre-nonce"));
  });

  it("refuse un jeton émis pour une autre application", async () => {
    await rejected(client().verifyIdToken(await idToken({ aud: "autre-app" }), "n-1"));
  });

  it("refuse un émetteur qui ne correspond pas au tenant du jeton", async () => {
    await rejected(client().verifyIdToken(await idToken({ iss: `https://login.microsoftonline.com/${CONSUMER_TENANT_ID}/v2.0` }), "n-1"));
    await rejected(client().verifyIdToken(await idToken({ iss: "https://evil.example/v2.0" }), "n-1"));
  });

  it("refuse un jeton signé par une autre clé", async () => {
    const other = await generateKeyPair("RS256");
    await rejected(client().verifyIdToken(await idToken({}, other.privateKey), "n-1"));
  });

  it("refuse un jeton expiré", async () => {
    const expired = await new SignJWT({ iss: `https://login.microsoftonline.com/${SCHOOL_TENANT}/v2.0`, aud: CLIENT_ID, sub: "s", tid: SCHOOL_TENANT, oid: "o", nonce: "n-1" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);
    await rejected(client().verifyIdToken(expired, "n-1"));
  });

  it("applique la liste de tenants autorisés et l'autorité configurée", async () => {
    await rejected(client({ allowedTenants: [CONSUMER_TENANT_ID] }).verifyIdToken(await idToken(), "n-1"), "MICROSOFT_TENANT_NOT_ALLOWED");
    await rejected(client({ tenant: "consumers" }).verifyIdToken(await idToken(), "n-1"), "MICROSOFT_TENANT_NOT_ALLOWED");
    await rejected(client({ tenant: CONSUMER_TENANT_ID }).verifyIdToken(await idToken(), "n-1"), "MICROSOFT_TENANT_NOT_ALLOWED");
    const ok = await client({ allowedTenants: [SCHOOL_TENANT] }).verifyIdToken(await idToken(), "n-1");
    expect(ok.tenantId).toBe(SCHOOL_TENANT);
  });

  it("construit l'URL d'autorisation avec PKCE S256, state et nonce", () => {
    const url = new URL(client().authorizationUrl({ state: "st", nonce: "nn", codeVerifier: "verifier-verifier-verifier-verifier-verif" }));
    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: "openid profile email",
      state: "st",
      nonce: "nn",
      code_challenge: codeChallenge("verifier-verifier-verifier-verifier-verif"),
      code_challenge_method: "S256",
    });
    expect(url.searchParams.has("client_secret")).toBe(false);
  });

  it("échange le code avec le vérificateur PKCE et le secret, puis valide le jeton", async () => {
    const token = await idToken();
    let sent: URLSearchParams | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      expect(url).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
      sent = init.body as URLSearchParams;
      return new Response(JSON.stringify({ id_token: token, access_token: "ignored" }), { status: 200 });
    }) as unknown as typeof fetch;
    const identity = await new EntraIdClient(config, { jwks, fetch: fetchFn }).exchangeCode("the-code", "the-verifier", "n-1");
    expect(identity.tenantId).toBe(SCHOOL_TENANT);
    expect(sent?.get("code")).toBe("the-code");
    expect(sent?.get("code_verifier")).toBe("the-verifier");
    expect(sent?.get("client_secret")).toBe("s");
    expect(sent?.get("grant_type")).toBe("authorization_code");
  });

  it("transforme une erreur de l'échange en MICROSOFT_FAILED", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    await rejected(new EntraIdClient(config, { jwks, fetch: fetchFn }).exchangeCode("c", "v", "n-1"));
  });
});

describe("usernameCandidate", () => {
  it("garde la partie locale, remplace les caractères interdits et respecte les longueurs", () => {
    expect(usernameCandidate("jean.dupont@isen.example", 0)).toBe("jean.dupont");
    expect(usernameCandidate("é+x@outlook.example", 0)).toBe("__x");
    expect(usernameCandidate("ab@x.example", 0)).toBe("user_ab");
    const long = usernameCandidate(`${"a".repeat(60)}@x.example`, 3);
    expect(long).toMatch(/^a{24}-[0-9a-f]{6}$/);
    expect(long.length).toBeLessThanOrEqual(32);
  });
});

/** Client Microsoft factice : l'identité renvoyée dépend du code reçu. */
class FakeMicrosoft implements MicrosoftClient {
  readonly identities = new Map<string, MicrosoftIdentity>();
  lastVerifier: string | undefined;
  lastNonce: string | undefined;

  authorizationUrl({ state, nonce }: { state: string; nonce: string; codeVerifier: string }): string {
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=${state}&nonce=${nonce}`;
  }

  async exchangeCode(code: string, codeVerifier: string, nonce: string): Promise<MicrosoftIdentity> {
    this.lastVerifier = codeVerifier;
    this.lastNonce = nonce;
    const identity = this.identities.get(code);
    if (!identity) throw new MicrosoftLoginError("MICROSOFT_FAILED", "unknown code");
    return identity;
  }
}

describe("routes /auth/microsoft", () => {
  let t: TestApp;
  const fake = new FakeMicrosoft();

  beforeAll(async () => {
    t = await createTestApp(MS_ENV, { microsoftClient: fake });
  });

  afterAll(async () => {
    await t.close();
  });

  const flowCookieOf = (res: LightMyRequestResponse) => res.cookies.find((c) => c.name === "chatisen_oidc");

  /** Départ vers Microsoft : renvoie le state de l'URL et le cookie de flux. */
  async function start(): Promise<{ state: string; cookie: string }> {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/auth/microsoft/start" });
    expect(res.statusCode).toBe(302);
    const state = new URL(res.headers.location as string).searchParams.get("state")!;
    return { state, cookie: flowCookieOf(res)!.value };
  }

  async function callback(query: string, cookie?: string) {
    return t.app.inject({
      method: "GET",
      url: `/api/v1/auth/microsoft/callback?${query}`,
      ...(cookie ? { cookies: { chatisen_oidc: cookie } } : {}),
    });
  }

  async function login(code: string) {
    const { state, cookie } = await start();
    return callback(`code=${code}&state=${state}`, cookie);
  }

  function identity(n: string, extra: Partial<MicrosoftIdentity> = {}): MicrosoftIdentity {
    return {
      subject: `${SCHOOL_TENANT}:${n}`,
      tenantId: SCHOOL_TENANT,
      email: `${n}@isen.example`,
      emailVerified: false,
      name: `Étudiant ${n}`,
      ...extra,
    };
  }

  it("annonce la connexion Microsoft dans /auth/providers", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/auth/providers" });
    expect(res.statusCode).toBe(200);
    expect(Value.Check(AuthProviders, res.json())).toBe(true);
    expect(res.json()).toEqual({ password: true, microsoft: true });
  });

  it("start pose un cookie de flux httpOnly SameSite=Lax limité aux routes Microsoft", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/auth/microsoft/start" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/login\.microsoftonline\.com\//);
    expect(flowCookieOf(res)).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api/v1/auth/microsoft", maxAge: 600 });
  });

  it("crée un compte sans mot de passe au premier retour, puis le retrouve aux suivants", async () => {
    fake.identities.set("new-1", identity("new1"));
    const first = await login("new-1");
    expect(first.statusCode).toBe(303);
    expect(first.headers.location).toBe("/");
    const refreshToken = refreshCookieOf(first);
    expect(refreshToken).toBeDefined();
    // Le cookie de flux est effacé, le vérificateur PKCE du cookie a bien été transmis.
    expect(flowCookieOf(first)?.value).toBe("");
    expect(fake.lastVerifier).toHaveLength(43);

    // La session Microsoft est une session ChatISEN ordinaire (ADR-0007) : le refresh fonctionne.
    const refreshed = await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", cookies: { chatisen_refresh: refreshToken! } });
    expect(refreshed.statusCode).toBe(200);
    const body = refreshed.json() as AuthResponse;
    expect(body.user).toMatchObject({ username: "new1", displayName: "Étudiant new1", email: "new1@isen.example" });

    const stored = await t.testDb.db.selectFrom("users").select("password_hash").where("id", "=", body.user.id).executeTakeFirstOrThrow();
    expect(stored.password_hash).toBeNull();

    const again = await login("new-1");
    const second = await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", cookies: { chatisen_refresh: refreshCookieOf(again)! } });
    expect((second.json() as AuthResponse).user.id).toBe(body.user.id);
  });

  it("un compte créé par Microsoft ne peut pas se connecter par mot de passe", async () => {
    fake.identities.set("nopw", identity("nopw"));
    await login("nopw");
    const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "nopw", password: "nimporte quoi" } });
    expect(res.statusCode).toBe(401);
  });

  it("ajoute un suffixe quand le nom d'utilisateur est déjà pris", async () => {
    const taken = await registerUser(t.app, "dup");
    fake.identities.set("dup", identity("other", { email: `${taken.user.username}@isen.example` }));
    const res = await login("dup");
    const me = (await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", cookies: { chatisen_refresh: refreshCookieOf(res)! } })).json() as AuthResponse;
    expect(me.user.username).toMatch(new RegExp(`^${taken.user.username}-[0-9a-f]{6}$`));
  });

  it("refuse de lier un compte existant quand l'adresse n'est pas vérifiée par Microsoft", async () => {
    const local = await registerUser(t.app, "local");
    fake.identities.set("hijack", identity("hijack", { email: local.user.email, emailVerified: false }));
    const res = await login("hijack");
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe("/?authError=MICROSOFT_ACCOUNT_EXISTS");
    expect(refreshCookieOf(res)).toBeUndefined();
    const links = await t.testDb.db.selectFrom("user_identities").selectAll().where("user_id", "=", local.user.id).execute();
    expect(links).toHaveLength(0);
  });

  it("lie un compte existant quand l'adresse est vérifiée (xms_edov), et le mot de passe reste valable", async () => {
    const local = await registerUser(t.app, "linked");
    fake.identities.set("link", identity("link", { email: local.user.email.toUpperCase(), emailVerified: true }));
    const res = await login("link");
    const me = (await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", cookies: { chatisen_refresh: refreshCookieOf(res)! } })).json() as AuthResponse;
    expect(me.user.id).toBe(local.user.id);

    const pw = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: local.user.username, password: local.password } });
    expect(pw.statusCode).toBe(200);
  });

  it("refuse une identité sans adresse", async () => {
    fake.identities.set("noemail", identity("noemail", { email: undefined }));
    const res = await login("noemail");
    expect(res.headers.location).toBe("/?authError=MICROSOFT_EMAIL_MISSING");
  });

  it("refuse un retour sans cookie de flux (CSRF de connexion) ou avec un autre state", async () => {
    fake.identities.set("csrf", identity("csrf"));
    const { state, cookie } = await start();
    const noCookie = await callback(`code=csrf&state=${state}`);
    expect(noCookie.headers.location).toBe("/?authError=MICROSOFT_FAILED");
    const wrongState = await callback(`code=csrf&state=autre`, cookie);
    expect(wrongState.headers.location).toBe("/?authError=MICROSOFT_FAILED");
    const forged = await callback(`code=csrf&state=${state}`, `${cookie.slice(0, -4)}AAAA`);
    expect(forged.headers.location).toBe("/?authError=MICROSOFT_FAILED");
    expect(refreshCookieOf(noCookie) ?? refreshCookieOf(wrongState) ?? refreshCookieOf(forged)).toBeUndefined();
  });

  it("refuse un access token ChatISEN présenté comme cookie de flux", async () => {
    const user = await registerUser(t.app, "confused");
    const res = await callback(`code=x&state=x`, user.accessToken);
    expect(res.headers.location).toBe("/?authError=MICROSOFT_FAILED");
  });

  it("renvoie MICROSOFT_DENIED quand l'utilisateur annule chez Microsoft", async () => {
    const { cookie } = await start();
    const res = await callback("error=access_denied&error_description=cancelled", cookie);
    expect(res.headers.location).toBe("/?authError=MICROSOFT_DENIED");
  });

  it("renvoie la raison d'un jeton refusé (tenant non autorisé)", async () => {
    const original = fake.exchangeCode.bind(fake);
    fake.exchangeCode = async () => {
      throw new MicrosoftLoginError("MICROSOFT_TENANT_NOT_ALLOWED", "test");
    };
    try {
      const res = await login("whatever");
      expect(res.headers.location).toBe("/?authError=MICROSOFT_TENANT_NOT_ALLOWED");
    } finally {
      fake.exchangeCode = original;
    }
  });
});

describe("connexion Microsoft non configurée", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it("n'expose pas les routes et l'annonce dans /auth/providers", async () => {
    expect((await t.app.inject({ method: "GET", url: "/api/v1/auth/providers" })).json()).toEqual({ password: true, microsoft: false });
    expect((await t.app.inject({ method: "GET", url: "/api/v1/auth/microsoft/start" })).statusCode).toBe(404);
  });
});
