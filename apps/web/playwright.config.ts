import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout de la messagerie (issue #81) : une vraie API (Postgres + Redis) et le
 * client Vite, pilotés par Chromium. Ports dédiés pour ne pas gêner un `pnpm dev` en cours.
 * Prérequis : Postgres et Redis joignables (`pnpm db:up` en local, services en CI).
 */
const API_PORT = 3100;
const WEB_PORT = 5174;
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  "postgres://chatisen:chatisen-dev@127.0.0.1:5432/chatisen";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  // Les scénarios partagent la même base : en série, pour des résultats lisibles et stables.
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "off",
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
    },
  },
  webServer: [
    {
      command: "npx --no-install tsx src/server.ts",
      cwd: "../api",
      url: `http://127.0.0.1:${API_PORT}/api/v1/health/ready`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        API_PORT: String(API_PORT),
        LOG_LEVEL: "warn",
        DATABASE_URL: databaseUrl,
        REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
        // Les scénarios créent beaucoup de comptes depuis 127.0.0.1 ; la limite est testée côté API.
        RATE_LIMIT_ENABLED: "false",
        // Clé jetable, tirée à chaque lancement.
        JWT_SECRET: randomBytes(48).toString("base64"),
        TURN_SHARED_SECRET: randomBytes(48).toString("base64"),
        TURN_URLS: "stun:stun.l.google.com:19302",
        CALL_RING_TIMEOUT_SECONDS: "5",
        CALL_DISCONNECT_GRACE_SECONDS: "3",
      },
    },
    {
      command: `npx --no-install vite --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
