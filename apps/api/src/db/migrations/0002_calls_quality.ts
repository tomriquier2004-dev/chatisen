import { sql, type Kysely } from "kysely";

/**
 * Tables minimales des appels 1-1 et des mesures de qualité (FR-09, FR-10, FR-13).
 * Les participants sont explicites : l'appartenance à la conversation ne donne pas
 * automatiquement le droit d'écrire des mesures pour un appel donné.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("calls")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("conversation_id", "uuid", (c) => c.notNull().references("conversations.id").onDelete("cascade"))
    .addColumn("media", "text", (c) => c.notNull().check(sql`media IN ('audio', 'video')`))
    .addColumn("initiator_id", "uuid", (c) => c.notNull().references("users.id"))
    .addColumn("started_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("ended_at", "timestamptz")
    .addColumn("end_reason", "text")
    .execute();

  await db.schema
    .createTable("call_participants")
    .addColumn("call_id", "uuid", (c) => c.notNull().references("calls.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("joined_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("left_at", "timestamptz")
    .addPrimaryKeyConstraint("call_participants_pkey", ["call_id", "user_id"])
    .execute();
  await db.schema.createIndex("call_participants_user_id").on("call_participants").column("user_id").execute();

  await db.schema
    .createTable("call_quality_samples")
    .addColumn("id", "bigserial", (c) => c.primaryKey())
    .addColumn("call_id", "uuid", (c) => c.notNull())
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("ts", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("rtt_ms", "real", (c) => c.notNull().check(sql`rtt_ms >= 0`))
    .addColumn("jitter_ms", "real", (c) => c.notNull().check(sql`jitter_ms >= 0`))
    .addColumn("packet_loss_pct", "real", (c) =>
      c.notNull().check(sql`packet_loss_pct >= 0 AND packet_loss_pct <= 100`),
    )
    .addColumn("bitrate_kbps", "integer", (c) => c.notNull().check(sql`bitrate_kbps >= 0`))
    .addColumn("candidate_type", "text", (c) =>
      c.notNull().check(sql`candidate_type IN ('host', 'srflx', 'relay')`),
    )
    .addForeignKeyConstraint(
      "call_quality_samples_participant_fk",
      ["call_id", "user_id"],
      "call_participants",
      ["call_id", "user_id"],
    )
    .onDelete("cascade")
    .execute();
  await db.schema.createIndex("call_quality_samples_call_ts").on("call_quality_samples").columns(["call_id", "ts"]).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ["call_quality_samples", "call_participants", "calls"]) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
