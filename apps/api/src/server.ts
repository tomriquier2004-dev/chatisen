import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createClient } from "redis";
import { createDb, migrateToLatest } from "./db";
import { FallbackRateLimiter, MemoryRateLimiter, RedisRateLimiter } from "./plugins/rate-limit";
import { attachRealtime } from "./realtime";
import { RealtimeEvents } from "./realtime/events";

const config = loadConfig();
const db = createDb(config.DATABASE_URL, config.DATABASE_POOL_SIZE);
// Les routes REST préviennent le temps réel des changements d'appartenance et des révocations (§ 5.3).
const events = new RealtimeEvents();
// Compteurs de limitation de débit partagés entre instances via Redis (issue #71).
// disableOfflineQueue : si Redis est coupé, une commande échoue tout de suite (bascule en mémoire)
// au lieu d'attendre la reconnexion et de bloquer la requête.
const limiterRedis = config.REDIS_URL
  ? createClient({ url: config.REDIS_URL, disableOfflineQueue: true })
  : undefined;
// Redis indisponible : bascule sur des compteurs en mémoire par instance (issue #88).
const rateLimiter = limiterRedis
  ? new FallbackRateLimiter(new RedisRateLimiter(limiterRedis), new MemoryRateLimiter(), (err) =>
      // Appelé seulement en cours d'exécution, quand app existe déjà.
      app.log.warn({ err }, "rate limit: redis unavailable, in-memory fallback"),
    )
  : new MemoryRateLimiter();
const app = buildApp(config, { db, membershipEvents: events, sessionEvents: events, rateLimiter });
if (limiterRedis) {
  limiterRedis.on("error", (err) => app.log.warn({ err }, "redis error (rate limit)"));
  app.addHook("onClose", async () => void (await limiterRedis.quit()));
}

// Arrêt propre : Docker et le terminal envoient SIGTERM / SIGINT, on termine les requêtes en cours.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    app
      .close()
      .then(() => db.destroy())
      .then(
        () => process.exit(0),
        (err: unknown) => {
          app.log.error({ err }, "error during shutdown");
          process.exit(1);
        },
      );
  });
}

try {
  // Migrations au démarrage, sous le verrou de Kysely : plusieurs instances peuvent démarrer ensemble.
  const { results } = await migrateToLatest(db);
  for (const r of results ?? []) app.log.info({ migration: r.migrationName, status: r.status }, "migration");
  await limiterRedis?.connect();
  await attachRealtime(app, {
    redisUrl: config.REDIS_URL,
    events,
    rateLimit: { limiter: rateLimiter, enabled: config.RATE_LIMIT_ENABLED },
    callRingTimeoutSeconds: config.CALL_RING_TIMEOUT_SECONDS,
    callDisconnectGraceSeconds: config.CALL_DISCONNECT_GRACE_SECONDS,
  });
  if (!config.REDIS_URL) app.log.warn("REDIS_URL absent : Socket.IO sans adapter Redis (une seule instance possible)");
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (err) {
  app.log.fatal({ err }, "failed to start");
  await db.destroy().catch(() => undefined);
  process.exit(1);
}
