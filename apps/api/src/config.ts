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
  /** Clé HMAC des access tokens (HS256). 32 caractères minimum ; à générer avec `openssl rand -base64 48`. */
  JWT_SECRET: Type.String({ minLength: 32 }),
  ACCESS_TOKEN_TTL_SECONDS: Type.Integer({ minimum: 60, maximum: 3600, default: 900 }),
  REFRESH_TOKEN_TTL_DAYS: Type.Integer({ minimum: 1, maximum: 90, default: 30 }),
});

export type Config = Static<typeof ConfigSchema>;

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
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(ConfigSchema.properties)) {
    const value = env[key];
    if (value !== undefined && value !== "") raw[key] = value;
  }
  if (raw.NODE_ENV !== "production") {
    for (const [key, value] of Object.entries(DEV_DEFAULTS)) raw[key] ??= value;
  }
  const withDefaults = Value.Default(ConfigSchema, raw);
  const converted = Value.Convert(ConfigSchema, withDefaults);
  if (!Value.Check(ConfigSchema, converted)) {
    // Le message nomme la variable fautive sans répéter sa valeur (elle peut contenir un mot de passe).
    const problems = [...Value.Errors(ConfigSchema, converted)].map((e) => `${e.path.slice(1)}: ${e.message}`);
    throw new ConfigError(`Configuration invalide : ${problems.join(" ; ")}`);
  }
  return converted;
}
