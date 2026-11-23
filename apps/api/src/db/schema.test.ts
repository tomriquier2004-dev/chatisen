import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateToLatest } from "./index";
import { createTestDb, type TestDb } from "../test/db";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.drop();
});

async function seed() {
  const [alice, bob] = await t.db
    .insertInto("users")
    .values([
      { username: `alice-${randomUUID()}`, email: `${randomUUID()}@example.test`, password_hash: "x", display_name: "Alice" },
      { username: `bob-${randomUUID()}`, email: `${randomUUID()}@example.test`, password_hash: "x", display_name: "Bob" },
    ])
    .returning("id")
    .execute();
  const conv = await t.db
    .insertInto("conversations")
    .values({ type: "group", title: "Projet" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { alice: alice!.id, bob: bob!.id, conv: conv.id };
}

describe("migrations", () => {
  it("sont idempotentes (un second passage n'applique rien)", async () => {
    const { results } = await migrateToLatest(t.db);
    expect(results).toEqual([]);
  });
});

describe("contraintes du modèle de données (architecture § 4)", () => {
  it("refuse deux messages avec le même seq dans une conversation", async () => {
    const { alice, conv } = await seed();
    const msg = { conversation_id: conv, sender_id: alice, seq: 1, body: "salut" };
    await t.db.insertInto("messages").values({ ...msg, client_msg_id: randomUUID() }).execute();
    await expect(
      t.db.insertInto("messages").values({ ...msg, client_msg_id: randomUUID() }).execute(),
    ).rejects.toThrow(/messages_conversation_seq/);
  });

  it("refuse un doublon de client_msg_id dans une conversation (idempotence)", async () => {
    const { alice, conv } = await seed();
    const clientMsgId = randomUUID();
    await t.db
      .insertInto("messages")
      .values({ conversation_id: conv, sender_id: alice, seq: 1, client_msg_id: clientMsgId, body: "a" })
      .execute();
    await expect(
      t.db
        .insertInto("messages")
        .values({ conversation_id: conv, sender_id: alice, seq: 2, client_msg_id: clientMsgId, body: "a" })
        .execute(),
    ).rejects.toThrow(/messages_conversation_client_msg/);
  });

  it("refuse un message vide", async () => {
    const { alice, conv } = await seed();
    await expect(
      t.db
        .insertInto("messages")
        .values({ conversation_id: conv, sender_id: alice, seq: 1, client_msg_id: randomUUID(), body: "" })
        .execute(),
    ).rejects.toThrow(/check/);
  });

  it("impose une seule conversation privée par paire", async () => {
    const { alice, bob } = await seed();
    const key = [alice, bob].sort().join(":");
    await t.db.insertInto("conversations").values({ type: "private", private_key: key }).execute();
    await expect(
      t.db.insertInto("conversations").values({ type: "private", private_key: key }).execute(),
    ).rejects.toThrow(/private_key/);
  });

  it("refuse une conversation privée sans clé de paire", async () => {
    await expect(
      t.db.insertInto("conversations").values({ type: "private" }).execute(),
    ).rejects.toThrow(/conversations_private_key_matches_type/);
  });

  it("refuse un rôle inconnu", async () => {
    const { alice, conv } = await seed();
    await expect(
      t.db
        .insertInto("conversation_members")
        .values({ conversation_id: conv, user_id: alice, role: "superadmin" as "member" })
        .execute(),
    ).rejects.toThrow(/check/);
  });

  it("compare les noms d'utilisateur sans tenir compte de la casse", async () => {
    const name = `Carol-${randomUUID()}`;
    await t.db
      .insertInto("users")
      .values({ username: name, email: `${randomUUID()}@example.test`, password_hash: "x", display_name: "C" })
      .execute();
    await expect(
      t.db
        .insertInto("users")
        .values({ username: name.toUpperCase(), email: `${randomUUID()}@example.test`, password_hash: "x", display_name: "C" })
        .execute(),
    ).rejects.toThrow(/users_username/);
  });
});
