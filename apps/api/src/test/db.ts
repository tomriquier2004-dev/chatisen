import { randomUUID } from "node:crypto";
import pg from "pg";
import { createDb, migrateToLatest, type Db } from "../db";

/**
 * Base de test jetable : une base PostgreSQL neuve par fichier de test, migrée, puis supprimée.
 * Serveur cible : TEST_DATABASE_URL (CI), sinon la base de infra/compose/compose.dev.yml (`pnpm db:up`).
 */
const SERVER_URL = process.env.TEST_DATABASE_URL ?? "postgres://chatisen:chatisen-dev@127.0.0.1:5432/chatisen";

export interface TestDb {
  db: Db;
  url: string;
  drop(): Promise<void>;
}

async function admin(query: (client: pg.Client) => Promise<unknown>): Promise<void> {
  const client = new pg.Client({ connectionString: SERVER_URL });
  await client.connect();
  try {
    await query(client);
  } finally {
    await client.end();
  }
}

export async function createTestDb(): Promise<TestDb> {
  const name = `chatisen_test_${randomUUID().replaceAll("-", "")}`;
  await admin((c) => c.query(`CREATE DATABASE ${c.escapeIdentifier(name)}`));
  const url = new URL(SERVER_URL);
  url.pathname = `/${name}`;
  const db = createDb(url.toString(), 5);
  await migrateToLatest(db);
  return {
    db,
    url: url.toString(),
    async drop() {
      await db.destroy();
      await admin((c) => c.query(`DROP DATABASE IF EXISTS ${c.escapeIdentifier(name)} WITH (FORCE)`));
    },
  };
}
