import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb, migrateToLatest } from "./db";
import { attachRealtime } from "./realtime";
import { RealtimeEvents } from "./realtime/events";

const config = loadConfig();
const db = createDb(config.DATABASE_URL, config.DATABASE_POOL_SIZE);
// Les routes REST préviennent le temps réel des changements d'appartenance et des révocations (§ 5.3).
const events = new RealtimeEvents();
const app = buildApp(config, { db, membershipEvents: events, sessionEvents: events });

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
  await attachRealtime(app, { redisUrl: config.REDIS_URL, events });
  if (!config.REDIS_URL) app.log.warn("REDIS_URL absent : Socket.IO sans adapter Redis (une seule instance possible)");
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (err) {
  app.log.fatal({ err }, "failed to start");
  await db.destroy().catch(() => undefined);
  process.exit(1);
}
