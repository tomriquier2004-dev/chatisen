import { sql, type Kysely } from "kysely";

/**
 * Connexion par un fournisseur d'identité externe (ADR-0020, Microsoft Entra ID).
 * - user_identities relie un compte ChatISEN à une identité externe stable (`tid:oid` pour
 *   Microsoft), jamais à l'adresse e-mail, qui est modifiable chez le fournisseur.
 * - password_hash devient facultatif : un compte créé par Microsoft n'a pas de mot de passe.
 *   Changement non destructif : les lignes existantes gardent leur empreinte.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("user_identities")
    .addColumn("provider", "text", (c) => c.notNull().check(sql`provider IN ('microsoft')`))
    .addColumn("subject", "text", (c) => c.notNull())
    .addColumn("user_id", "uuid", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("user_identities_pkey", ["provider", "subject"])
    .execute();
  await db.schema.createIndex("user_identities_user_id").on("user_identities").column("user_id").execute();

  await db.schema.alterTable("users").alterColumn("password_hash", (c) => c.dropNotNull()).execute();
}

/**
 * Retour arrière : échoue tant qu'un compte sans mot de passe existe (on ne supprime pas de compte
 * en silence). Les liaisons Microsoft sont perdues.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("users").alterColumn("password_hash", (c) => c.setNotNull()).execute();
  await db.schema.dropTable("user_identities").ifExists().execute();
}
