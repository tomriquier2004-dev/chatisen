import { randomBytes } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * Configuration lue dans les variables d'environnement, validée au démarrage :
 * une valeur invalide arrête le processus au lieu de produire un comportement surprenant.
 */
const ConfigSchema = Type.Object({
  NODE_ENV: Type.Union([Type.Literal("development"), Type.Literal("test"), Type.Literal("production")], {
    default: "development",
  }),
  API_HOST: Type.String({ minLength: 1, default: "127.0.0.1" }),
  API_PORT: Type.Integer({ minimum: 1, maximum: 65535, default: 3000 }),
  LOG_LEVEL: Type.Union(
    ["fatal", "error", "warn", "info", "debug", "trace", "silent"].map((level) => Type.Literal(level)),
    { default: "info" },
  ),
  DATABASE_URL: Type.String({ pattern: "^postgres(ql)?://" }),
  DATABASE_POOL_SIZE: Type.Integer({ minimum: 1, maximum: 100, default: 10 }),
  /**
   * Redis pour l'adapter Socket.IO (diffusion entre instances). Absent : instance unique, sans adapter.
   * Obligatoire dès que plusieurs instances d'API tournent.
   */
  REDIS_URL: Type.Optional(Type.String({ pattern: "^rediss?://" })),
  /** Clé HMAC des access tokens (HS256). 32 caractères minimum ; à générer avec `openssl rand -base64 48`. */
  JWT_SECRET: Type.String({ minLength: 32 }),
  /** Limitation de débit sur l'authentification et la recherche (issue #71). Désactivable pour les tests. */
  RATE_LIMIT_ENABLED: Type.Boolean({ default: true }),
  /**
   * Faire confiance à X-Forwarded-For (adresse réelle du client derrière Caddy). À activer seulement
   * derrière le reverse proxy : sinon un client pourrait choisir l'adresse comptée par la limite.
   */
  TRUST_PROXY: Type.Boolean({ default: false }),
  /**
   * Attribut Secure du cookie de refresh. Absent : activé partout sauf en development et test
   * (issue #73). À ne désactiver explicitement que pour un environnement servi en HTTP local.
   */
  COOKIE_SECURE: Type.Optional(Type.Boolean()),
  ACCESS_TOKEN_TTL_SECONDS: Type.Integer({ minimum: 60, maximum: 3600, default: 900 }),
  REFRESH_TOKEN_TTL_DAYS: Type.Integer({ minimum: 1, maximum: 90, default: 30 }),
  /** Secret coturn REST (use-auth-secret), jamais exposé au client. */
  TURN_SHARED_SECRET: Type.Optional(Type.String({ minLength: 32 })),
  /** URLs STUN/TURN séparées par des virgules, sans identifiants. */
  TURN_URLS: Type.Optional(Type.String({ minLength: 1, maxLength: 16_384 })),
  TURN_CREDENTIAL_TTL_SECONDS: Type.Integer({ minimum: 60, maximum: 86_400, default: 3_600 }),
  CALL_RING_TIMEOUT_SECONDS: Type.Integer({ minimum: 5, maximum: 120, default: 30 }),
  CALL_DISCONNECT_GRACE_SECONDS: Type.Integer({ minimum: 3, maximum: 60, default: 10 }),
});

export type Config = Static<typeof ConfigSchema> & {
  /** Variables remplies par les valeurs de développement plutôt que par l'environnement. */
  readonly devDefaultsUsed: readonly string[];
};

/** Adresses d'écoute locales : seules celles-ci tolèrent les valeurs de développement. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * Cookie Secure : explicite si COOKIE_SECURE est fourni ; sinon désactivé seulement en development
 * ou test **sur une adresse locale**. Un serveur exposé garde Secure même si NODE_ENV a été oublié.
 */
export function secureCookies(config: Pick<Config, "COOKIE_SECURE" | "NODE_ENV" | "API_HOST">): boolean {
  if (config.COOKIE_SECURE !== undefined) return config.COOKIE_SECURE;
  const devLike = config.NODE_ENV === "development" || config.NODE_ENV === "test";
  return !(devLike && LOCAL_HOSTS.has(config.API_HOST));
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

/**
 * Valeurs utilisées seulement hors production, pour que `pnpm db:up && pnpm dev` marche sans .env.
 * Elles pointent vers infra/compose/compose.dev.yml (mot de passe de développement, sans valeur).
 * La clé JWT de développement est tirée au hasard à chaque démarrage : les sessions ne survivent
 * pas à un redémarrage, ce qui est acceptable en développement. En production, ces variables sont obligatoires.
 */
const DEV_DEFAULTS: Record<string, string> = {
  DATABASE_URL: "postgres://chatisen:chatisen-dev@127.0.0.1:5432/chatisen",
  JWT_SECRET: randomBytes(48).toString("base64"),
  REDIS_URL: "redis://127.0.0.1:6379",
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(ConfigSchema.properties)) {
    const value = env[key];
    if (value !== undefined && value !== "") raw[key] = value;
  }
  const devDefaultsUsed: string[] = [];
  if (raw.NODE_ENV !== "production") {
    for (const [key, value] of Object.entries(DEV_DEFAULTS)) {
      if (raw[key] === undefined) {
        raw[key] = value;
        devDefaultsUsed.push(key);
      }
    }
  }
  const withDefaults = Value.Default(ConfigSchema, raw);
  const converted = Value.Convert(ConfigSchema, withDefaults);
  if (!Value.Check(ConfigSchema, converted)) {
    // Le message nomme la variable fautive sans répéter sa valeur (elle peut contenir un mot de passe).
    const problems = [...Value.Errors(ConfigSchema, converted)].map((e) => `${e.path.slice(1)}: ${e.message}`);
    throw new ConfigError(`Configuration invalide : ${problems.join(" ; ")}`);
  }
  // Issue #73 : un serveur joignable depuis le réseau (API_HOST non local) ne démarre pas avec
  // les valeurs de développement, même si NODE_ENV a été oublié. Une clé JWT tirée au hasard
  // différerait d'une instance à l'autre et à chaque redémarrage.
  const risky = devDefaultsUsed.filter((k) => k === "JWT_SECRET" || k === "DATABASE_URL");
  if (!LOCAL_HOSTS.has(converted.API_HOST) && risky.length > 0) {
    throw new ConfigError(
      `Configuration invalide : API_HOST=${converted.API_HOST} n'est pas une adresse locale, ` +
        `${risky.join(" et ")} doivent être fournis explicitement (NODE_ENV=production recommandé)`,
    );
  }
  if (!LOCAL_HOSTS.has(converted.API_HOST)) {
    const turnSecret = converted.TURN_SHARED_SECRET?.toLowerCase();
    const weakTurnSecret = !turnSecret || ["change-me", "changeme", "development", "dev-secret", "test-secret"].some((v) => turnSecret.includes(v));
    const missingTurn = [weakTurnSecret ? "TURN_SHARED_SECRET" : "", !converted.TURN_URLS ? "TURN_URLS" : ""].filter(Boolean);
    if (missingTurn.length > 0) {
      throw new ConfigError(`Configuration invalide : ${missingTurn.join(" et ")} doivent être fournis explicitement sur un hôte exposé`);
    }
  }
  return { ...converted, devDefaultsUsed };
}
