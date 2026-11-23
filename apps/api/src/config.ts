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
});

export type Config = Static<typeof ConfigSchema>;

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(ConfigSchema.properties)) {
    const value = env[key];
    if (value !== undefined && value !== "") raw[key] = value;
  }
  const withDefaults = Value.Default(ConfigSchema, raw);
  const converted = Value.Convert(ConfigSchema, withDefaults);
  if (!Value.Check(ConfigSchema, converted)) {
    const problems = [...Value.Errors(ConfigSchema, converted)].map((e) => `${e.path.slice(1)}: ${e.message}`);
    throw new ConfigError(`Configuration invalide : ${problems.join(" ; ")}`);
  }
  return converted;
}
