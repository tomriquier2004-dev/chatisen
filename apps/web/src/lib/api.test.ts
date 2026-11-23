import { describe, expect, it } from "vitest";
import { Type } from "@sinclair/typebox";
import { ApiClient } from "./api";
import { ApiError } from "./errors";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "alice",
  displayName: "Alice",
  email: "alice@example.test",
};
const auth = (token: string) => ({ accessToken: token, expiresIn: 900, user });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const error = (status: number, code: string) => json(status, { error: { code, message: "m", requestId: "r" } });

/** Faux serveur : compte les appels par route et répond via `routes`. */
function fakeServer(routes: Record<string, (init: RequestInit) => Response | Promise<Response>>) {
  const calls: Record<string, number> = {};
  const fetchFn: typeof fetch = async (input, init = {}) => {
    const key = `${init.method ?? "GET"} ${String(input)}`;
    calls[key] = (calls[key] ?? 0) + 1;
    const handler = routes[key];
    if (!handler) return error(404, "NOT_FOUND");
    return handler(init);
  };
  return { fetchFn, calls };
}

const Ok = Type.Object({ ok: Type.Literal(true) });

describe("restauration de session", () => {
  it("récupère la session par /auth/refresh et garde le token en mémoire", async () => {
    const { fetchFn } = fakeServer({ "POST /api/v1/auth/refresh": () => json(200, auth("t1")) });
    const api = new ApiClient({ fetch: fetchFn });
    const session = await api.restore();
    expect(session?.user.username).toBe("alice");
    expect(await api.accessToken()).toBe("t1");
  });

  it("sans cookie valide, il n'y a pas de session", async () => {
    const { fetchFn } = fakeServer({ "POST /api/v1/auth/refresh": () => error(401, "UNAUTHENTICATED") });
    const api = new ApiClient({ fetch: fetchFn });
    expect(await api.restore()).toBeNull();
  });
});

describe("rafraîchissement à requête unique", () => {
  it("des appels simultanés ne déclenchent qu'un seul /auth/refresh", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { fetchFn, calls } = fakeServer({
      "POST /api/v1/auth/refresh": async () => {
        await gate;
        return json(200, auth("t1"));
      },
      "GET /api/v1/things": () => json(200, { ok: true }),
    });
    const api = new ApiClient({ fetch: fetchFn });
    const pending = Promise.all([1, 2, 3, 4, 5].map(() => api.request("GET", "/things", Ok)));
    release();
    await pending;
    expect(calls["POST /api/v1/auth/refresh"]).toBe(1);
    expect(calls["GET /api/v1/things"]).toBe(5);
  });

  it("les refresh passent par le verrou entre onglets", async () => {
    const taken: string[] = [];
    const { fetchFn } = fakeServer({ "POST /api/v1/auth/refresh": () => json(200, auth("t1")) });
    const api = new ApiClient({
      fetch: fetchFn,
      lock: async (name, run) => {
        taken.push(name);
        return run();
      },
    });
    await api.restore();
    expect(taken).toEqual(["chatisen-refresh"]);
  });

  it("réessaie une fois après un 401 de la fenêtre de grâce (autre onglet plus rapide)", async () => {
    let n = 0;
    const { fetchFn, calls } = fakeServer({
      "POST /api/v1/auth/refresh": () => (++n === 1 ? error(401, "UNAUTHENTICATED") : json(200, auth("t2"))),
    });
    const api = new ApiClient({ fetch: fetchFn });
    expect((await api.restore())?.accessToken).toBe("t2");
    expect(calls["POST /api/v1/auth/refresh"]).toBe(2);
  });
});

describe("token expiré et 401", () => {
  it("rafraîchit avant d'appeler quand le token expire bientôt", async () => {
    let now = 0;
    let issued = 0;
    const { fetchFn, calls } = fakeServer({
      "POST /api/v1/auth/refresh": () => json(200, auth(`t${++issued}`)),
      "GET /api/v1/things": (init) => {
        const header = (init.headers as Record<string, string>).authorization;
        return header === "Bearer t2" ? json(200, { ok: true }) : error(401, "UNAUTHENTICATED");
      },
    });
    const api = new ApiClient({ fetch: fetchFn, now: () => now });
    await api.restore();
    now = 899_000; // 1 s avant l'expiration : sous la marge de 30 s
    await api.request("GET", "/things", Ok);
    expect(calls["POST /api/v1/auth/refresh"]).toBe(2);
  });

  it("sur un 401 d'une route protégée, rafraîchit puis réessaie une fois", async () => {
    let issued = 0;
    const { fetchFn, calls } = fakeServer({
      "POST /api/v1/auth/refresh": () => json(200, auth(`t${++issued}`)),
      "GET /api/v1/things": (init) =>
        (init.headers as Record<string, string>).authorization === "Bearer t1"
          ? error(401, "UNAUTHENTICATED")
          : json(200, { ok: true }),
    });
    const api = new ApiClient({ fetch: fetchFn });
    await api.restore();
    expect(await api.request("GET", "/things", Ok)).toEqual({ ok: true });
    expect(calls["GET /api/v1/things"]).toBe(2);
  });

  it("si le refresh échoue aussi, la session est fermée et l'erreur remonte", async () => {
    let first = true;
    const { fetchFn } = fakeServer({
      "POST /api/v1/auth/refresh": () => {
        if (first) {
          first = false;
          return json(200, auth("t1"));
        }
        return error(401, "UNAUTHENTICATED");
      },
      "GET /api/v1/things": () => error(401, "UNAUTHENTICATED"),
    });
    const api = new ApiClient({ fetch: fetchFn });
    const seen: Array<string | null> = [];
    api.subscribe((s) => seen.push(s?.accessToken ?? null));
    await api.restore();
    await expect(api.request("GET", "/things", Ok)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(api.current).toBeNull();
    expect(seen.at(-1)).toBeNull();
  });
});

describe("erreurs", () => {
  it("convertit le format d'erreur unique en message lisible par code", async () => {
    const { fetchFn } = fakeServer({ "POST /api/v1/auth/login": () => error(401, "INVALID_CREDENTIALS") });
    const api = new ApiClient({ fetch: fetchFn });
    const err = await api.login({ username: "alice", password: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "INVALID_CREDENTIALS", message: "Identifiant ou mot de passe incorrect." });
  });

  it("signale une réponse hors contrat", async () => {
    const { fetchFn } = fakeServer({ "POST /api/v1/auth/login": () => json(200, { accessToken: 42 }) });
    const api = new ApiClient({ fetch: fetchFn });
    await expect(api.login({ username: "a", password: "b" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("signale un serveur injoignable", async () => {
    const api = new ApiClient({
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(api.login({ username: "a", password: "b" })).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
