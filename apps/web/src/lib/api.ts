import type { TSchema, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  API_PREFIX,
  AuthProviders,
  AuthResponse,
  ErrorResponse,
  type LoginRequest,
  type Me,
  type RegisterRequest,
} from "@chatisen/shared";
import { ApiError } from "./errors";

export interface Session {
  user: Me;
  accessToken: string;
  /** Instant (ms) où l'access token expire. */
  expiresAt: number;
}

type Listener = (session: Session | null) => void;

/** Verrou entre onglets (Web Locks API) ; absent (tests, vieux navigateurs) : verrou local seulement. */
export type LockFn = <T>(name: string, run: () => Promise<T>) => Promise<T>;

const browserLock: LockFn | undefined =
  typeof navigator !== "undefined" && navigator.locks
    ? (name, run) => navigator.locks.request(name, run)
    : undefined;

export interface ApiClientOptions {
  fetch?: typeof fetch;
  lock?: LockFn;
  /** Rafraîchir un peu avant l'expiration, pour ne pas envoyer un token sur le point d'expirer. */
  refreshMarginMs?: number;
  now?: () => number;
}

/**
 * Client REST de l'application (issue #77).
 * - L'access token reste **en mémoire** (jamais localStorage) ; la session est restaurée au
 *   chargement par `/auth/refresh`, grâce au cookie httpOnly (architecture § 6.1).
 * - Rafraîchissement **à requête unique** : les appels simultanés d'un onglet partagent le même
 *   refresh, et le verrou Web Locks sérialise les onglets (issue #72).
 * - Chaque réponse est validée par le schéma de `@chatisen/shared` ; toute erreur devient une
 *   `ApiError` avec un message lisible par code.
 */
export class ApiClient {
  private session: Session | null = null;
  private refreshing: Promise<Session | null> | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly fetchFn: typeof fetch;
  private readonly lock: LockFn | undefined;
  private readonly marginMs: number;
  private readonly now: () => number;

  constructor(opts: ApiClientOptions = {}) {
    this.fetchFn = opts.fetch ?? ((...args) => fetch(...args));
    this.lock = opts.lock ?? browserLock;
    this.marginMs = opts.refreshMarginMs ?? 30_000;
    this.now = opts.now ?? Date.now;
  }

  get current(): Session | null {
    return this.session;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setSession(session: Session | null): void {
    this.session = session;
    for (const l of this.listeners) l(session);
  }

  private fromAuth(res: AuthResponse): Session {
    return { user: res.user, accessToken: res.accessToken, expiresAt: this.now() + res.expiresIn * 1000 };
  }

  /** Requête HTTP brute → corps JSON validé, ou ApiError. */
  private async send<S extends TSchema>(
    method: string,
    path: string,
    schema: S | null,
    body?: unknown,
    token?: string,
  ): Promise<Static<S>> {
    let res: Response;
    try {
      res = await this.fetchFn(`${API_PREFIX}${path}`, {
        method,
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ApiError("NETWORK_ERROR", undefined);
    }

    if (res.status === 204 || schema === null) {
      if (!res.ok) throw await this.toError(res);
      return undefined as Static<S>;
    }
    if (!res.ok) throw await this.toError(res);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiError("INVALID_RESPONSE", res.status);
    }
    if (!Value.Check(schema, json)) throw new ApiError("INVALID_RESPONSE", res.status);
    return json;
  }

  private async toError(res: Response): Promise<ApiError> {
    try {
      const json: unknown = await res.json();
      if (Value.Check(ErrorResponse, json)) {
        return new ApiError(json.error.code, res.status, json.error.message, json.error.requestId);
      }
    } catch {
      // corps absent ou non JSON : traité ci-dessous
    }
    return new ApiError(res.status >= 500 ? "INTERNAL_ERROR" : "INVALID_RESPONSE", res.status);
  }

  async register(body: RegisterRequest): Promise<Session> {
    const session = this.fromAuth(await this.send("POST", "/auth/register", AuthResponse, body));
    this.setSession(session);
    return session;
  }

  async login(body: LoginRequest): Promise<Session> {
    const session = this.fromAuth(await this.send("POST", "/auth/login", AuthResponse, body));
    this.setSession(session);
    return session;
  }

  /** Fournisseurs de connexion activés par le serveur (ADR-0020). En cas d'échec : mot de passe seul. */
  async providers(): Promise<AuthProviders> {
    try {
      return await this.send("GET", "/auth/providers", AuthProviders);
    } catch {
      return { password: true, microsoft: false };
    }
  }

  async logout(): Promise<void> {
    try {
      await this.send("POST", "/auth/logout", null);
    } finally {
      this.setSession(null);
    }
  }

  /** Au chargement de la page : récupère une session si le cookie de refresh est valide. */
  async restore(): Promise<Session | null> {
    return this.refresh();
  }

  /**
   * Rafraîchit la session, une seule fois à la fois : les appels concurrents de l'onglet
   * partagent la même promesse, et le verrou sérialise les onglets.
   */
  refresh(): Promise<Session | null> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<Session | null> {
    const startedWith = this.session?.accessToken;
    const run = async (): Promise<Session | null> => {
      // Un autre appel a déjà rafraîchi pendant l'attente du verrou : rien à faire.
      if (this.session && this.session.accessToken !== startedWith && this.isFresh(this.session)) {
        return this.session;
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const session = this.fromAuth(await this.send("POST", "/auth/refresh", AuthResponse));
          this.setSession(session);
          return session;
        } catch (err) {
          // 401 juste après le refresh d'un autre onglet (fenêtre de grâce du serveur, #72) :
          // le cookie a été remplacé entre-temps, un second essai l'utilise.
          if (err instanceof ApiError && err.code === "UNAUTHENTICATED" && attempt === 0) continue;
          if (err instanceof ApiError && err.code === "UNAUTHENTICATED") {
            this.setSession(null);
            return null;
          }
          throw err;
        }
      }
      return null;
    };
    return this.lock ? this.lock("chatisen-refresh", run) : run();
  }

  private isFresh(session: Session): boolean {
    return session.expiresAt - this.marginMs > this.now();
  }

  /** Access token valide (rafraîchi si besoin), ou null si l'utilisateur n'est pas connecté. */
  async accessToken(): Promise<string | null> {
    if (this.session && this.isFresh(this.session)) return this.session.accessToken;
    return (await this.refresh())?.accessToken ?? null;
  }

  /** Requête authentifiée ; un 401 déclenche un refresh puis un seul nouvel essai. */
  async request<S extends TSchema>(method: string, path: string, schema: S | null, body?: unknown): Promise<Static<S>> {
    const token = await this.accessToken();
    if (!token) throw new ApiError("UNAUTHENTICATED", 401);
    try {
      return await this.send(method, path, schema, body, token);
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== "UNAUTHENTICATED") throw err;
      const session = await this.refresh();
      if (!session) throw err;
      return this.send(method, path, schema, body, session.accessToken);
    }
  }
}
