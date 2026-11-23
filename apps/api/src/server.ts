import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const app = buildApp(config);

// Arrêt propre : Docker et le terminal envoient SIGTERM / SIGINT, on termine les requêtes en cours.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    app.close().then(
      () => process.exit(0),
      (err: unknown) => {
        app.log.error({ err }, "error during shutdown");
        process.exit(1);
      },
    );
  });
}

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (err) {
  app.log.fatal({ err }, "failed to start");
  process.exit(1);
}
