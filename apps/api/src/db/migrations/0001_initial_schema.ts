import { sql, type Kysely } from "kysely";

/**
 * Schéma initial de la messagerie (docs/architecture.md § 4).
 * - seq par conversation + UNIQUE (conversation_id, seq) : ordre défini par le serveur.
 * - UNIQUE (conversation_id, client_msg_id) : un renvoi après coupure ne crée pas de doublon (FR-17, FR-18).
 * - private_key UNIQUE : une seule conversation privée par paire d'utilisateurs.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS citext`.execute(db);

  await db.schema
    .createTable("users")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("username", sql`citext`, (c) => c.notNull().unique())
    .addColumn("email", sql`citext`, (c) => c.notNull().unique())
    .addColumn("password_hash", "text", (c) => c.notNull())
    .addColumn("display_name", "text", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("sessions")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("refresh_token_hash", "text", (c) => c.notNull().unique())
    .addColumn("family_id", "uuid", (c) => c.notNull())
    .addColumn("expires_at", "timestamptz", (c) => c.notNull())
    .addColumn("revoked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("sessions_family_id").on("sessions").column("family_id").execute();
  await db.schema.createIndex("sessions_user_id").on("sessions").column("user_id").execute();

  await db.schema
    .createTable("conversations")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("type", "text", (c) => c.notNull().check(sql`type IN ('private', 'group')`))
    .addColumn("title", "text")
    .addColumn("private_key", "text", (c) => c.unique())
    .addColumn("last_seq", "bigint", (c) => c.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "conversations_private_key_matches_type",
      sql`(type = 'private') = (private_key IS NOT NULL)`,
    )
    .execute();

  await db.schema
    .createTable("conversation_members")
    .addColumn("conversation_id", "uuid", (c) => c.notNull().references("conversations.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("role", "text", (c) =>
      c.notNull().defaultTo("member").check(sql`role IN ('owner', 'admin', 'member')`),
    )
    .addColumn("last_read_seq", "bigint", (c) => c.notNull().defaultTo(0))
    .addColumn("joined_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("conversation_members_pkey", ["conversation_id", "user_id"])
    .execute();
  await db.schema.createIndex("conversation_members_user_id").on("conversation_members").column("user_id").execute();

  await db.schema
    .createTable("messages")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("conversation_id", "uuid", (c) => c.notNull().references("conversations.id").onDelete("cascade"))
    .addColumn("sender_id", "uuid", (c) => c.notNull().references("users.id"))
    .addColumn("seq", "bigint", (c) => c.notNull())
    .addColumn("client_msg_id", "uuid", (c) => c.notNull())
    .addColumn("body", "text", (c) => c.notNull().check(sql`char_length(body) BETWEEN 1 AND 4000`))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    // L'index de cette contrainte sert aussi l'historique paginé (conversation_id, seq DESC).
    .addUniqueConstraint("messages_conversation_seq", ["conversation_id", "seq"])
    .addUniqueConstraint("messages_conversation_client_msg", ["conversation_id", "client_msg_id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ["messages", "conversation_members", "conversations", "sessions", "users"]) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
