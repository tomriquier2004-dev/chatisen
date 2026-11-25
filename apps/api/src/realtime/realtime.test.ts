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
  config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", RATE_LIMIT_ENABLED: "false", JWT_SECRET: randomBytes(48).toString("base64"), CALL_RING_TIMEOUT_SECONDS: "5", CALL_DISCONNECT_GRACE_SECONDS: "3" });
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

async function privateOf(user: RegisteredUser, other: RegisteredUser): Promise<ConversationView> {
  const res = await a.app.inject({
    method: "POST",
    url: "/api/v1/conversations",
    headers: { authorization: `Bearer ${user.accessToken}` },
    payload: { type: "private", userId: other.user.id },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as ConversationView;
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

describe("aperçu, non-lus et accusés de lecture", () => {
  it("GET /conversations donne le dernier message et trie par activité ; message:read remet les non-lus à zéro", async () => {
    const alice = await registerUser(a.app, "alice");
    const bob = await registerUser(a.app, "bob");
    const older = await groupOf(alice, [bob]);
    const newer = await groupOf(alice, [bob]);
    const aliceSocket = await open(a, alice);
    const bobSocket = await open(a, bob);
    await send(aliceSocket, newer.id, "dans la récente");
    await send(aliceSocket, older.id, "un");
    await send(aliceSocket, older.id, "deux");

    const list = async () =>
      (
        await a.app.inject({ method: "GET", url: "/api/v1/conversations", headers: { authorization: `Bearer ${bob.accessToken}` } })
      ).json() as ConversationView[];

    let convs = await list();
    // La conversation la plus récemment active passe en tête, avec son dernier message.
    expect(convs[0]?.id).toBe(older.id);
    expect(convs[0]?.lastMessage?.body).toBe("deux");
    expect(convs[0]?.unreadCount).toBe(2);

    const read = (await bobSocket.timeout(2000).emitWithAck("message:read", { conversationId: older.id, seq: 99 })) as Ack<{ lastReadSeq: number }>;
    // Borné au dernier message existant.
    expect(read).toEqual({ ok: true, data: { lastReadSeq: 2 } });
    // Ne recule jamais.
    const back = (await bobSocket.timeout(2000).emitWithAck("message:read", { conversationId: older.id, seq: 1 })) as Ack<{ lastReadSeq: number }>;
    expect(back).toEqual({ ok: true, data: { lastReadSeq: 2 } });

    convs = await list();
    expect(convs.find((c) => c.id === older.id)?.unreadCount).toBe(0);
    expect(convs.find((c) => c.id === newer.id)?.unreadCount).toBe(1);
  });

  it("refuse l'accusé de lecture d'un non-membre", async () => {
    const alice = await registerUser(a.app, "alice");
    const outsider = await registerUser(a.app, "outsider");
    const conv = await groupOf(alice, []);
    const socket = await open(a, outsider);
    const res = (await socket.timeout(2000).emitWithAck("message:read", { conversationId: conv.id, seq: 1 })) as Ack<unknown>;
    expect(res).toMatchObject({ ok: false, error: { code: "CONVERSATION_FORBIDDEN" } });
  });

  it("un changement de rôle est diffusé aux membres connectés", async () => {
    const alice = await registerUser(a.app, "alice");
    const bob = await registerUser(a.app, "bob");
    const conv = await groupOf(alice, [bob]);
    const bobOnB = await open(b, bob);
    const updated = nextEvent(bobOnB, "conversation:member-updated");
    await a.app.inject({
      method: "PATCH",
      url: `/api/v1/conversations/${conv.id}/members/${bob.user.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { role: "admin" },
    });
    expect(await updated).toEqual({ conversationId: conv.id, userId: bob.user.id, role: "admin", by: alice.user.id });
  });
});

describe("/health/ready", () => {
  it("rapporte Redis quand l'adapter est actif", async () => {
    const res = await a.app.inject({ method: "GET", url: "/api/v1/health/ready" });
    expect(res.json()).toEqual({ status: "ready", checks: { postgres: "up", redis: "up" } });
  });
});


describe("appels 1-1 et signalisation WebRTC", () => {
  it("établit un appel audio, relaie SDP/ICE uniquement entre participants et termine proprement", async () => {
    const alice = await registerUser(a.app, "call-alice");
    const bob = await registerUser(a.app, "call-bob");
    const conv = await privateOf(alice, bob);
    const aliceSocket = await open(a, alice);
    const bobSocket = await open(b, bob);

    const incoming = nextEvent(bobSocket, "call:incoming");
    const invite = (await aliceSocket.timeout(2000).emitWithAck("call:invite", { conversationId: conv.id, media: "audio" })) as CallAck<CallInviteAck>;
    expect(invite.ok).toBe(true);
    if (!invite.ok) return;
    const callId = invite.data.callId;
    expect(await incoming).toMatchObject({ callId, conversationId: conv.id, from: alice.user.id, media: "audio" } satisfies Partial<CallIncomingEvent>);

    const accepted = nextEvent(aliceSocket, "call:accepted");
    const accept = (await bobSocket.timeout(2000).emitWithAck("call:accept", { callId })) as CallAck<{ callId: string }>;
    expect(accept).toEqual({ ok: true, data: { callId } });
    expect(await accepted).toEqual({ callId, userId: bob.user.id } satisfies CallAcceptedEvent);

    const offer = nextEvent(bobSocket, "rtc:offer");
    const offerAck = (await aliceSocket.timeout(2000).emitWithAck("rtc:offer", { callId, to: bob.user.id, sdp: "v=0" })) as CallAck<{ relayed: true }>;
    expect(offerAck).toEqual({ ok: true, data: { relayed: true } });
    expect(await offer).toEqual({ callId, from: alice.user.id, sdp: "v=0" } satisfies RtcDescriptionEvent);

    const answer = nextEvent(aliceSocket, "rtc:answer");
    const answerAck = (await bobSocket.timeout(2000).emitWithAck("rtc:answer", { callId, to: alice.user.id, sdp: "v=0-answer" })) as CallAck<{ relayed: true }>;
    expect(answerAck.ok).toBe(true);
    expect(await answer).toEqual({ callId, from: bob.user.id, sdp: "v=0-answer" } satisfies RtcDescriptionEvent);

    const candidate = nextEvent(bobSocket, "rtc:ice-candidate");
    const candidateAck = (await aliceSocket.timeout(2000).emitWithAck("rtc:ice-candidate", {
      callId, to: bob.user.id, candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 },
    })) as CallAck<{ relayed: true }>;
    expect(candidateAck.ok).toBe(true);
    expect(await candidate).toEqual({
      callId, from: alice.user.id, candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 },
    } satisfies RtcIceCandidateEvent);

    const endedA = nextEvent(aliceSocket, "call:ended");
    const endedB = nextEvent(bobSocket, "call:ended");
    const hangup = (await bobSocket.timeout(2000).emitWithAck("call:hangup", { callId })) as CallAck<{ callId: string }>;
    expect(hangup.ok).toBe(true);
    expect(await endedA).toEqual({ callId, reason: "hangup" } satisfies CallEndedEvent);
    expect(await endedB).toEqual({ callId, reason: "hangup" } satisfies CallEndedEvent);

    const call = await testDb.db.selectFrom("calls").select(["ended_at", "end_reason"]).where("id", "=", callId).executeTakeFirstOrThrow();
    expect(call.ended_at).not.toBeNull();
    expect(call.end_reason).toBe("hangup");
    const participants = await testDb.db.selectFrom("call_participants").select(["user_id", "left_at"]).where("call_id", "=", callId).execute();
    expect(participants).toHaveLength(2);
    expect(participants.every((p) => p.left_at !== null)).toBe(true);
  });

  it("refuse un appel, termine avec rejected et empêche une seconde invitation pendant un appel actif", async () => {
    const alice = await registerUser(a.app, "call-alice");
    const bob = await registerUser(a.app, "call-bob");
    const carol = await registerUser(a.app, "call-carol");
    const ab = await privateOf(alice, bob);
    const bc = await privateOf(bob, carol);
    const aliceSocket = await open(a, alice);
    const bobSocket = await open(b, bob);
    const carolSocket = await open(b, carol);

    const incoming = nextEvent(bobSocket, "call:incoming");
    const invite = (await aliceSocket.timeout(2000).emitWithAck("call:invite", { conversationId: ab.id, media: "video" })) as CallAck<CallInviteAck>;
    expect(invite.ok).toBe(true);
    if (!invite.ok) return;
    await incoming;
    const rejected = nextEvent(aliceSocket, "call:ended");
    const reject = (await bobSocket.timeout(2000).emitWithAck("call:reject", { callId: invite.data.callId })) as CallAck<{ callId: string }>;
    expect(reject.ok).toBe(true);
    expect(await rejected).toEqual({ callId: invite.data.callId, reason: "rejected" });

    const incomingCarol = nextEvent(carolSocket, "call:incoming");
    const bobInvite = (await bobSocket.timeout(2000).emitWithAck("call:invite", { conversationId: bc.id, media: "audio" })) as CallAck<CallInviteAck>;
    expect(bobInvite.ok).toBe(true);
    if (!bobInvite.ok) return;
    await incomingCarol;
    const bobAccepted = nextEvent(bobSocket, "call:accepted");
    await carolSocket.timeout(2000).emitWithAck("call:accept", { callId: bobInvite.data.callId });
    await bobAccepted;

    const noIncoming = noEvent(bobSocket, "call:incoming");
    const busyEnded = nextEvent(aliceSocket, "call:ended");
    const busy = (await aliceSocket.timeout(2000).emitWithAck("call:invite", { conversationId: ab.id, media: "audio" })) as CallAck<CallInviteAck>;
    expect(busy.ok).toBe(true);
    if (!busy.ok) return;
    expect(await busyEnded).toEqual({ callId: busy.data.callId, reason: "busy" });
    expect(await noIncoming).toBe(true);
  });

  it("expire une sonnerie sans réponse et refuse les relais vers un tiers", async () => {
    const alice = await registerUser(a.app, "call-alice");
    const bob = await registerUser(a.app, "call-bob");
    const outsider = await registerUser(a.app, "call-outsider");
    const conv = await privateOf(alice, bob);
    const aliceSocket = await open(a, alice);
    const bobSocket = await open(b, bob);
    const outsiderSocket = await open(b, outsider);

    const incoming = nextEvent(bobSocket, "call:incoming");
    const invite = (await aliceSocket.timeout(2000).emitWithAck("call:invite", { conversationId: conv.id, media: "audio" })) as CallAck<CallInviteAck>;
    expect(invite.ok).toBe(true);
    if (!invite.ok) return;
    await incoming;
    const ended = await nextEvent(aliceSocket, "call:ended", 7000);
    expect(ended).toEqual({ callId: invite.data.callId, reason: "timeout" });

    const notMember = (await outsiderSocket.timeout(2000).emitWithAck("call:invite", { conversationId: conv.id, media: "audio" })) as CallAck<CallInviteAck>;
    expect(notMember).toMatchObject({ ok: false, error: { code: "CONVERSATION_FORBIDDEN" } });
  });

  it("termine l'appel si un participant reste déconnecté au-delà du délai de grâce", async () => {
    const alice = await registerUser(a.app, "call-alice");
    const bob = await registerUser(a.app, "call-bob");
    const conv = await privateOf(alice, bob);
    const aliceSocket = await open(a, alice);
    const bobSocket = await open(b, bob);
    const incoming = nextEvent(bobSocket, "call:incoming");
    const invite = (await aliceSocket.timeout(2000).emitWithAck("call:invite", { conversationId: conv.id, media: "audio" })) as CallAck<CallInviteAck>;
    expect(invite.ok).toBe(true);
    if (!invite.ok) return;
    await incoming;
    const accepted = nextEvent(aliceSocket, "call:accepted");
    await bobSocket.timeout(2000).emitWithAck("call:accept", { callId: invite.data.callId });
    await accepted;
    const ended = nextEvent(aliceSocket, "call:ended", 6000);
    bobSocket.close();
    expect(await ended).toEqual({ callId: invite.data.callId, reason: "disconnected" });
  });
});
