import { Kysely, PostgresDialect } from "kysely";
import { Migrator, type Migration, type MigrationResultSet } from "kysely/migration";
import pg from "pg";
import * as m0001 from "./migrations/0001_initial_schema";
import * as m0002 from "./migrations/0002_calls_quality";
import * as m0003 from "./migrations/0003_user_identities";
import type { Database } from "./schema";

// bigint (seq, last_seq) : renvoyé en nombre JS. Sûr jusqu'à 2^53, très au-delà du volume du projet.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export type Db = Kysely<Database>;

export function createDb(connectionString: string, poolSize = 10): Db {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max: poolSize }) }),
  });
}

/**
 * Migrations déclarées dans le code plutôt que lues sur le disque : elles restent dans le bundle
 * tsup (dist/server.js). Nommage « NNNN_description », appliquées dans l'ordre alphabétique.
 */
const migrations: Record<string, Migration> = {
  "0001_initial_schema": m0001,
  "0002_calls_quality": m0002,
  "0003_user_identities": m0003,
};

/** Applique les migrations manquantes. Le verrou de Kysely protège les démarrages simultanés. */
export async function migrateToLatest(db: Db): Promise<MigrationResultSet> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
  const result = await migrator.migrateToLatest();
  if (result.error) throw result.error;
  return result;
}
