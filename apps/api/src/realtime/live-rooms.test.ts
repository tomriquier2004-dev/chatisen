import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Ack, ConversationView, Message } from "@chatisen/shared";
import { loadConfig, type Config } from "../config";
import { createTestDb, type TestDb } from "../test/db";
import { registerUser, type RegisteredUser } from "../test/app";
import { connect, nextEvent, noEvent, startInstance, type ClientSocket, type Instance } from "../test/realtime";

/**
 * Issue #57 (code de #7), architecture § 5.3 : les rooms suivent l'appartenance en direct.
 * Deux instances d'API sur la même base et le même Redis. Les requêtes REST passent par
 * l'instance A, et le membre concerné est connecté à l'instance B : c'est l'adapter Redis
 * qui doit relayer le join / leave.
 */
let testDb: TestDb;
let config: Config;
let a: Instance;
let b: Instance;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  testDb = await createTestDb();
  config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", RATE_LIMIT_ENABLED: "false", JWT_SECRET: randomBytes(48).toString("base64") });
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

function send(socket: ClientSocket, conversationId: string, body: string) {
  return socket
    .timeout(2000)
    .emitWithAck("message:send", { conversationId, clientMsgId: randomUUID(), body }) as Promise<Ack<Message>>;
}

function rest(user: RegisteredUser, method: "GET" | "POST" | "DELETE", url: string, payload?: object) {
  return a.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { authorization: `Bearer ${user.accessToken}` },
    ...(payload ? { payload } : {}),
  });
}

async function createGroup(owner: RegisteredUser, members: RegisteredUser[]): Promise<ConversationView> {
  const res = await rest(owner, "POST", "/conversations", {
    type: "group",
    title: "Rooms en direct",
    memberIds: members.map((m) => m.user.id),
  });
  expect(res.statusCode).toBe(201);
  return res.json() as ConversationView;
}

describe("retrait d'un membre connecté", () => {
  it("ses sockets quittent la room immédiatement : il ne reçoit plus message:new, les autres oui", async () => {
    const owner = await registerUser(a.app, "owner");
    const removed = await registerUser(a.app, "removed");
    const stays = await registerUser(a.app, "stays");
    const conv = await createGroup(owner, [removed, stays]);

    const ownerOnA = await open(a, owner);
    // Le membre retiré a deux onglets ouverts, sur l'instance qui ne traite pas la requête REST.
    const removedOnB1 = await open(b, removed);
    const removedOnB2 = await open(b, removed);
    const staysOnB = await open(b, stays);

    // Avant le retrait, le membre reçoit bien les messages.
    const before = nextEvent(removedOnB1, "message:new");
    await send(ownerOnA, conv.id, "avant");
    expect((await before).body).toBe("avant");

    const notified = nextEvent(removedOnB1, "conversation:member-removed");
    const othersNotified = nextEvent(staysOnB, "conversation:member-removed");
    expect((await rest(owner, "DELETE", `/conversations/${conv.id}/members/${removed.user.id}`)).statusCode).toBe(204);
    expect(await notified).toEqual({ conversationId: conv.id, userId: removed.user.id, by: owner.user.id, reason: "removed" });
    expect((await othersNotified).userId).toBe(removed.user.id);

    // Après le retrait : aucun des deux onglets ne reçoit le message, le membre restant oui.
    const silent1 = noEvent(removedOnB1, "message:new");
    const silent2 = noEvent(removedOnB2, "message:new");
    const delivered = nextEvent(staysOnB, "message:new");
    await send(ownerOnA, conv.id, "après");
    expect((await delivered).body).toBe("après");
    expect(await silent1).toBe(true);
    expect(await silent2).toBe(true);
  });

  it("le membre retiré ne peut plus écrire ni rattraper l'historique", async () => {
    const owner = await registerUser(a.app, "owner");
    const removed = await registerUser(a.app, "removed");
    const conv = await createGroup(owner, [removed]);
    const removedOnB = await open(b, removed);

    const notified = nextEvent(removedOnB, "conversation:member-removed");
    await rest(owner, "DELETE", `/conversations/${conv.id}/members/${removed.user.id}`);
    await notified;

    expect(await send(removedOnB, conv.id, "encore là ?")).toMatchObject({
      ok: false,
      error: { code: "CONVERSATION_FORBIDDEN" },
    });
    const sync = (await removedOnB
      .timeout(2000)
      .emitWithAck("conversation:sync", { conversationId: conv.id, afterSeq: 0 })) as Ack<Message[]>;
    expect(sync).toMatchObject({ ok: false, error: { code: "CONVERSATION_FORBIDDEN" } });
  });

  it("un départ volontaire produit le même effet", async () => {
    const owner = await registerUser(a.app, "owner");
    const leaver = await registerUser(a.app, "leaver");
    const conv = await createGroup(owner, [leaver]);
    const ownerOnA = await open(a, owner);
    const leaverOnB = await open(b, leaver);

    const notified = nextEvent(leaverOnB, "conversation:member-removed");
    await rest(leaver, "DELETE", `/conversations/${conv.id}/members/${leaver.user.id}`);
    expect((await notified).reason).toBe("left");

    const silent = noEvent(leaverOnB, "message:new");
    await send(ownerOnA, conv.id, "il est parti");
    expect(await silent).toBe(true);
  });
});

describe("ajout d'un membre connecté", () => {
  it("ses sockets rejoignent la room sans reconnexion", async () => {
    const owner = await registerUser(a.app, "owner");
    const newcomer = await registerUser(a.app, "newcomer");
    const conv = await createGroup(owner, []);
    const ownerOnA = await open(a, owner);
    const newcomerOnB = await open(b, newcomer);

    // Pas encore membre : rien n'arrive.
    const notYet = noEvent(newcomerOnB, "message:new");
    await send(ownerOnA, conv.id, "pas pour toi");
    expect(await notYet).toBe(true);

    const notified = nextEvent(newcomerOnB, "conversation:member-added");
    expect((await rest(owner, "POST", `/conversations/${conv.id}/members`, { userId: newcomer.user.id })).statusCode).toBe(201);
    expect(await notified).toEqual({ conversationId: conv.id, userId: newcomer.user.id, role: "member", by: owner.user.id });

    // Même socket, sans reconnexion : il reçoit le message suivant et peut écrire.
    const delivered = nextEvent(newcomerOnB, "message:new");
    await send(ownerOnA, conv.id, "bienvenue");
    expect((await delivered).body).toBe("bienvenue");
    expect((await send(newcomerOnB, conv.id, "merci")).ok).toBe(true);
  });

  it("un groupe ou une conversation privée créés pendant la connexion sont actifs tout de suite", async () => {
    const alice = await registerUser(a.app, "alice");
    const bob = await registerUser(a.app, "bob");
    const aliceOnA = await open(a, alice);
    const bobOnB = await open(b, bob);

    // Bob est prévenu de la nouvelle conversation : sa socket a rejoint la room.
    const bobJoined = new Promise<void>((resolve) =>
      bobOnB.on("conversation:member-added", (e) => {
        if (e.userId === bob.user.id) resolve();
      }),
    );
    const res = await rest(alice, "POST", "/conversations", { type: "private", userId: bob.user.id });
    expect(res.statusCode).toBe(201);
    const conv = res.json() as ConversationView;
    await bobJoined;

    const delivered = nextEvent(bobOnB, "message:new");
    await send(aliceOnA, conv.id, "salut Bob");
    expect((await delivered).body).toBe("salut Bob");
  });
});

describe("déconnexion forcée", () => {
  it("un logout ferme les sockets de cette session, sur toutes les instances", async () => {
    const bob = await registerUser(a.app, "bob");
    const bobOnB = await open(b, bob);

    const disconnected = new Promise<string>((resolve) => bobOnB.once("disconnect", resolve));
    const res = await a.app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      cookies: { chatisen_refresh: bob.refreshToken },
    });
    expect(res.statusCode).toBe(204);
    expect(await disconnected).toBe("io server disconnect");
  });

  it("ne ferme pas les sockets des autres sessions du même utilisateur", async () => {
    const bob = await registerUser(a.app, "bob");
    const login = await a.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: bob.user.username, password: bob.password },
    });
    const otherDevice = await open(b, { ...bob, accessToken: login.json().accessToken });
    await open(b, bob);

    await a.app.inject({ method: "POST", url: "/api/v1/auth/logout", cookies: { chatisen_refresh: bob.refreshToken } });
    await new Promise((r) => setTimeout(r, 300));
    expect(otherDevice.connected).toBe(true);
  });
});
