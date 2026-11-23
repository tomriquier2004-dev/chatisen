import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { AuthResponse } from "@chatisen/shared";
import { buildApp, type AppDeps } from "../app";
import { loadConfig, type Config } from "../config";
import { createTestDb, type TestDb } from "./db";

export interface TestApp {
  app: FastifyInstance;
  config: Config;
  testDb: TestDb;
  close(): Promise<void>;
}

/** Application complète sur une base jetable, sans port ouvert (requêtes via `app.inject`). */
export async function createTestApp(
  env: Record<string, string> = {},
  deps: Omit<AppDeps, "db"> = {},
): Promise<TestApp> {
  const testDb = await createTestDb();
  const config = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    // Les tests inscrivent beaucoup de comptes depuis 127.0.0.1 ; rate-limit.test.ts réactive la limite.
    RATE_LIMIT_ENABLED: "false",
    JWT_SECRET: randomBytes(48).toString("base64"),
    ...env,
  });
  const app = buildApp(config, { db: testDb.db, ...deps });
  await app.ready();
  return {
    app,
    config,
    testDb,
    async close() {
      await app.close();
      await testDb.drop();
    },
  };
}

/** Extrait la valeur du cookie de refresh d'une réponse. */
export function refreshCookieOf(res: LightMyRequestResponse): string | undefined {
  return res.cookies.find((c) => c.name === "chatisen_refresh")?.value || undefined;
}

export interface RegisteredUser extends AuthResponse {
  password: string;
  refreshToken: string;
}

/** Inscrit un utilisateur au nom unique et renvoie ses tokens. */
export async function registerUser(app: FastifyInstance, prefix = "user"): Promise<RegisteredUser> {
  const suffix = randomUUID().slice(0, 8);
  const password = `pw-${randomUUID()}`;
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      username: `${prefix}_${suffix}`,
      email: `${prefix}.${suffix}@example.test`,
      password,
      displayName: `${prefix} ${suffix}`,
    },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  return { ...(res.json() as AuthResponse), password, refreshToken: refreshCookieOf(res)! };
}
