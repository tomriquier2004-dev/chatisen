import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors";

/**
 * Limitation de débit (issue #71, architecture § 9) : fenêtre fixe par clé.
 * Compteurs dans Redis pour qu'ils soient partagés entre les instances d'API ; en mémoire
 * quand l'API tourne sans Redis (instance unique, tests).
 */
export interface RateLimiter {
  /** Compte un coup pour `key` ; renvoie le délai d'attente (ms) si la limite est dépassée. */
  hit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterMs: number }>;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, limit: number, windowMs: number) {
    const now = this.now();
    let w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      w = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, w);
    }
    w.count++;
    // Nettoyage paresseux pour ne pas grossir indéfiniment.
    if (this.windows.size > 10_000) {
      for (const [k, v] of this.windows) if (v.resetAt <= now) this.windows.delete(k);
    }
    return { allowed: w.count <= limit, retryAfterMs: Math.max(0, w.resetAt - now) };
  }
}

/** Le strict nécessaire du client Redis : exécuter un script Lua. */
export interface RedisEval {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

/** INCR, puis expiration posée à la création de la fenêtre seulement ; atomique (script Lua). */
const HIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
return { count, redis.call("PTTL", KEYS[1]) }
`;

export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: RedisEval,
    private readonly prefix = "ratelimit:",
  ) {}

  async hit(key: string, limit: number, windowMs: number) {
    const [count, ttl] = (await this.redis.eval(HIT_SCRIPT, {
      keys: [this.prefix + key],
      arguments: [String(windowMs)],
    })) as [number, number];
    return { allowed: count <= limit, retryAfterMs: Math.max(0, ttl) };
  }
}

/**
 * Redis indisponible (issue #88) : plutôt que de tout refuser (l'API deviendrait inutilisable) ou
 * de tout laisser passer (plus aucune protection), on bascule sur des compteurs en mémoire, par
 * instance. Les limites restent actives, mais ne sont plus partagées entre instances le temps de la panne.
 */
export class FallbackRateLimiter implements RateLimiter {
  constructor(
    private readonly primary: RateLimiter,
    private readonly fallback: RateLimiter,
    private readonly onError: (err: unknown) => void = () => undefined,
  ) {}

  async hit(key: string, limit: number, windowMs: number) {
    try {
      return await this.primary.hit(key, limit, windowMs);
    } catch (err) {
      this.onError(err);
      return this.fallback.hit(key, limit, windowMs);
    }
  }
}

/** Connexions Socket.IO simultanées par utilisateur, toutes instances confondues (onglets, appareils). */
export const MAX_CONNECTIONS_PER_USER = 10;

/** Envois de messages par utilisateur (événement message:send), toutes sockets et instances confondues. */
export const MESSAGE_SEND_RULE = { name: "message-send", limit: 20, windowMs: 10_000 } as const;

/** Une règle : nom (préfixe de clé), limite, fenêtre, et ce qui identifie le demandeur. */
export interface RateRule {
  name: string;
  limit: number;
  windowMs: number;
  /** Clé de comptage ; undefined = règle non applicable à cette requête. */
  key: (request: FastifyRequest) => string | undefined;
}

/**
 * Seuils de départ, à calibrer par la mesure (axes sécurité #27 et performance #24).
 * Ils visent le brute force et l'abus du coût d'Argon2id, pas l'usage normal d'une personne.
 */
const MINUTE = 60_000;
export const RATE_RULES = {
  loginPerIp: { name: "login-ip", limit: 20, windowMs: MINUTE, key: (r) => r.ip },
  loginPerAccount: {
    name: "login-account",
    limit: 10,
    windowMs: 15 * MINUTE,
    key: (r) => {
      const username = (r.body as { username?: unknown } | undefined)?.username;
      return typeof username === "string" ? username.toLowerCase() : undefined;
    },
  },
  registerPerIp: { name: "register-ip", limit: 10, windowMs: 60 * MINUTE, key: (r) => r.ip },
  // Départ et retour de la connexion Microsoft (ADR-0020) : deux requêtes par connexion.
  microsoftPerIp: { name: "microsoft-ip", limit: 30, windowMs: MINUTE, key: (r) => r.ip },
  refreshPerIp: { name: "refresh-ip", limit: 60, windowMs: MINUTE, key: (r) => r.ip },
  userSearchPerUser: { name: "user-search", limit: 30, windowMs: MINUTE, key: (r) => r.auth?.userId },
  // Collecte getStats : 30 lots/minute/utilisateur, seuil à calibrer par les mesures (issue #13).
  callQualityPerUser: { name: "call-quality", limit: 30, windowMs: MINUTE, key: (r) => r.auth?.userId },
} satisfies Record<string, RateRule>;

/**
 * preHandler qui applique les règles dans l'ordre ; la première dépassée répond 429 RATE_LIMITED
 * avec Retry-After. En preHandler (et non onRequest) pour lire le corps validé (nom du compte).
 */
export function rateLimit(limiter: RateLimiter, enabled: boolean, ...rules: RateRule[]) {
  return async function rateLimitHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!enabled) return;
    for (const rule of rules) {
      const key = rule.key(request);
      if (key === undefined) continue;
      const { allowed, retryAfterMs } = await limiter.hit(`${rule.name}:${key}`, rule.limit, rule.windowMs);
      if (!allowed) {
        reply.header("retry-after", Math.ceil(retryAfterMs / 1000));
        request.log.warn({ rule: rule.name }, "rate limit exceeded");
        throw new AppError(429, "RATE_LIMITED", "Trop de requêtes, réessayez plus tard");
      }
    }
  };
}
