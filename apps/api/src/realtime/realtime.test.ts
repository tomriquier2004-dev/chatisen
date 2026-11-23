import { randomBytes, randomUUID } from "node:crypto";
import { Value } from "@sinclair/typebox/value";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Message, type Ack, type ConversationView } from "@chatisen/shared";
import { loadConfig, type Config } from "../config";
import { createTestDb, type TestDb } from "../test/db";
import { registerUser, type RegisteredUser } from "../test/app";
import { connect, nextEvent, noEvent, startInstance, type ClientSocket, type Instance } from "../test/realtime";

let testDb: TestDb;
let config: Config;
// Deux instances d'API sur la même base et le même Redis : la configuration multi-instances du § 8.1.
let a: Instance;
let b: Instance;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  testDb = await createTestDb();
  config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", JWT_SECRET: randomBytes(48).toString("base64") });
  a = await startInstance(config, { db: testDb.db });
  b = await startInstance(config, { db: testDb.db });
});

afterEach(() => {
  for (const s of sockets.splice(0)) s.close();
});

afterAll(async () => {
  await a.close();
  await b.close();
  await testDb.drop();
});

async function open(instance: Instance, user: RegisteredUser): Promise<ClientSocket> {
  const socket = await connect(instance.url, user.accessToken);
  sockets.push(socket);
  return socket;
}

function send(socket: ClientSocket, conversationId: string, body: string, clientMsgId = randomUUID()) {
  return socket.timeout(2000).emitWithAck("message:send", { conversationId, clientMsgId, body }) as Promise<Ack<Message>>;
}

async function groupOf(owner: RegisteredUser, members: RegisteredUser[]): Promise<ConversationView> {
  const res = await a.app.inject({
    method: "POST",
    url: "/api/v1/conversations",
    headers: { authorization: `Bearer ${owner.accessToken}` },
    payload: { type: "group", title: "Temps réel", memberIds: members.map((m) => m.user.id) },
  });
  return res.json() as ConversationView;
}

describe("handshake", () => {
  it("refuse une connexion sans token", async () => {
    await expect(connect(a.url, undefined)).rejects.toThrow("UNAUTHENTICATED");
  });

  it("refuse un token invalide", async () => {
    await expect(connect(a.url, "pas.un.jwt")).rejects.toThrow("UNAUTHENTICATED");
  });
});

describe("message:send → message:new", () => {
  it("attribue un seq croissant et diffuse aux membres", async () => {
    const alice = await registerUser(a.app, "alice");
    const bob = await registerUser(a.app, "bob");
    const conv = await groupOf(alice, [bob]);
    const aliceSocket = await open(a, alice);
    const bobSocket = await open(a, bob);

    const received = nextEvent(bobSocket, "message:new");
    const first = await send(aliceSocket, conv.id, "bonjour");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Value.Check(Message, first.data)).toBe(true);
    expect(first.data).toMatchObject({ seq: 1, senderId: alice.user.id, body: "bonjour" });
    expect(await received).toEqual(first.data);

    const second = await send(aliceSocket, conv.id, "ça va ?");
    expect(second.ok && second.data.seq).toBe(2);
  });

  it("ne diffuse pas aux non-membres", async () => {
    const alice = await registerUser(a.app, "alice");
    const bob = await registerUser(a.app, "bob");
    const outsider = await registerUser(a.app, "outsider");
    const conv = await groupOf(alice, [bob]);
    const aliceSocket = await open(a, alice);
    const outsiderSocket = await open(a, outsider);

    const silent = noEvent(outsiderSocket, "message:new");
    await send(aliceSocket, conv.id, "privé");
    expect(await silent).toBe(true);
  });

  it("refuse l'envoi à un non-membre (autorisation à chaque événement)", async () => {
    const alice = await registerUser(a.app, "alice");
    const outsider = await registerUser(a.app, "outsider");
    const conv = await groupOf(alice, []);
    const outsiderSocket = await open(a, outsider);
    const res = await send(outsiderSocket, conv.id, "intrus");
    expect(res).toMatchObject({ ok: false, error: { code: "CONVERSATION_FORBIDDEN" } });
  });

  it("est idempotent sur clientMsgId : pas de doublon ni de seconde diffusion", async () => {
    const alice = await registerUser(a.app, "alice");
    const bob = await registerUser(a.app, "bob");
    const conv = await groupOf(alice, [bob]);
    const aliceSocket = await open(a, alice);
    const bobSocket = await open(a, bob);
    const clientMsgId = randomUUID();

    const firstBroadcast = nextEvent(bobSocket, "message:new");
    const first = await send(aliceSocket, conv.id, "une fois", clientMsgId);
    await firstBroadcast;
    const silent = noEvent(bobSocket, "message:new");
    const retry = await send(aliceSocket, conv.id, "une fois", clientMsgId);

    expect(retry).toEqual(first);
    expect(await silent).toBe(true);
    const count = await testDb.db
      .selectFrom("messages")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("conversation_id", "=", conv.id)
      .executeTakeFirstOrThrow();
    expect(Number(count.n)).toBe(1);
  });

  it("refuse un clientMsgId déjà utilisé par un autre membre, sans rien diffuser (#74)", async () => {
    const alice = await registerUser(a.app, "alice");
    const bob = await registerUser(a.app, "bob");
    const conv = await groupOf(alice, [bob]);
    const aliceSocket = await open(a, alice);
    const bobSocket = await open(a, bob);
    const clientMsgId = randomUUID();

    const aliceBroadcast = nextEvent(bobSocket, "message:new");
    const first = await send(aliceSocket, conv.id, "message d'Alice", clientMsgId);
    expect(first.ok).toBe(true);
    await aliceBroadcast;

    const silent = noEvent(aliceSocket, "message:new");
    const collision = await send(bobSocket, conv.id, "message de Bob", clientMsgId);
    expect(collision).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    // Bob ne reçoit pas le message d'Alice dans son ack, et rien n'est diffusé.
    expect(JSON.stringify(collision)).not.toContain("message d'Alice");
    expect(await silent).toBe(true);
  });

  it("valide le payload", async () => {
    const alice = await registerUser(a.app, "alice");
    const aliceSocket = await open(a, alice);
    const res = (await aliceSocket
      .timeout(2000)
      .emitWithAck("message:send", { conversationId: "nope", clientMsgId: "x", body: "" } as never)) as Ack<Message>;
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

describe("plusieurs instances (adapter Redis)", () => {
  it("un message envoyé sur l'instance A arrive au membre connecté sur l'instance B", async () => {
    const alice = await registerUser(a.app, "alice");
    const bob = await registerUser(a.app, "bob");
    const conv = await groupOf(alice, [bob]);
    const aliceOnA = await open(a, alice);
    const bobOnB = await open(b, bob);

    const received = nextEvent(bobOnB, "message:new");
    const sent = await send(aliceOnA, conv.id, "traverse les instances");
    expect(sent.ok).toBe(true);
    expect((await received).body).toBe("traverse les instances");
  });
});

describe("historique et rattrapage", () => {
  it("conversation:sync renvoie les messages manqués dans l'ordre", async () => {
    const alice = await registerUser(a.app, "alice");
    const bob = await registerUser(a.app, "bob");
    const conv = await groupOf(alice, [bob]);
    const aliceSocket = await open(a, alice);
    for (const body of ["un", "deux", "trois"]) await send(aliceSocket, conv.id, body);

    const bobSocket = await open(b, bob);
    const res = (await bobSocket.timeout(2000).emitWithAck("conversation:sync", { conversationId: conv.id, afterSeq: 1 })) as Ack<Message[]>;
    expect(res.ok && res.data.map((m) => [m.seq, m.body])).toEqual([
      [2, "deux"],
      [3, "trois"],
    ]);
  });

  it("GET /conversations/:id/messages pagine par seq et refuse les non-membres", async () => {
    const alice = await registerUser(a.app, "alice");
    const outsider = await registerUser(a.app, "outsider");
    const conv = await groupOf(alice, []);
    const aliceSocket = await open(a, alice);
    for (let i = 1; i <= 5; i++) await send(aliceSocket, conv.id, `m${i}`);

    const get = (user: RegisteredUser, qs: string) =>
      a.app.inject({
        method: "GET",
        url: `/api/v1/conversations/${conv.id}/messages${qs}`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      });

    const latest = await get(alice, "?limit=2");
    expect(latest.json().map((m: Message) => m.seq)).toEqual([4, 5]);
    const older = await get(alice, "?before=4&limit=2");
    expect(older.json().map((m: Message) => m.seq)).toEqual([2, 3]);
    expect((await get(outsider, "")).statusCode).toBe(403);
  });
});

describe("/health/ready", () => {
  it("rapporte Redis quand l'adapter est actif", async () => {
    const res = await a.app.inject({ method: "GET", url: "/api/v1/health/ready" });
    expect(res.json()).toEqual({ status: "ready", checks: { postgres: "up", redis: "up" } });
  });
});
