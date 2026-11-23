import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "redis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Ack, ConversationView, Message } from "@chatisen/shared";
import { loadConfig } from "../config";
import {
  FallbackRateLimiter,
  MAX_CONNECTIONS_PER_USER,
  MemoryRateLimiter,
  MESSAGE_SEND_RULE,
  RedisRateLimiter,
  type RateLimiter,
} from "../plugins/rate-limit";
import { registerUser } from "../test/app";
import { createTestDb, type TestDb } from "../test/db";
import { connect, startInstance, TEST_REDIS_URL, type ClientSocket, type Instance } from "../test/realtime";

/**
 * Issue #88 : limites des événements Socket.IO, partagées entre deux instances d'API
 * (même base, même Redis, compteurs Redis communs).
 */
let testDb: TestDb;
let a: Instance;
let b: Instance;
const redisClients: Array<{ quit(): Promise<unknown> }> = [];
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  testDb = await createTestDb();
  const config = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    RATE_LIMIT_ENABLED: "false",
    JWT_SECRET: randomBytes(48).toString("base64"),
  });
  // Préfixe propre à ce fichier : les compteurs des autres tests ne se mélangent pas.
  const prefix = `test:${randomUUID()}:`;
  const limiterFor = async (): Promise<RateLimiter> => {
    const client = createClient({ url: TEST_REDIS_URL });
    await client.connect();
    redisClients.push(client);
    return new RedisRateLimiter(client, prefix);
  };
  a = await startInstance(config, { db: testDb.db }, TEST_REDIS_URL, { limiter: await limiterFor(), enabled: true });
  b = await startInstance(config, { db: testDb.db }, TEST_REDIS_URL, { limiter: await limiterFor(), enabled: true });
});

afterEach(() => {
  for (const s of sockets.splice(0)) s.close();
});

afterAll(async () => {
  await a.close();
  await b.close();
  await Promise.all(redisClients.map((c) => c.quit()));
  await testDb.drop();
});

async function open(instance: Instance, token: string): Promise<ClientSocket> {
  const socket = await connect(instance.url, token);
  sockets.push(socket);
  return socket;
}

const send = (socket: ClientSocket, conversationId: string, body: string) =>
  socket
    .timeout(3000)
    .emitWithAck("message:send", { conversationId, clientMsgId: randomUUID(), body }) as Promise<Ack<Message>>;

describe("message:send", () => {
  it(`refuse au-delà de ${MESSAGE_SEND_RULE.limit} messages par utilisateur, toutes instances confondues, sans écrire en base`, async () => {
    const alice = await registerUser(a.app, "alice");
    const res = await a.app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { type: "group", title: "Flood", memberIds: [] },
    });
    const conv = res.json() as ConversationView;
    // Deux onglets, chacun sur une instance différente.
    const onA = await open(a, alice.accessToken);
    const onB = await open(b, alice.accessToken);

    for (let i = 0; i < MESSAGE_SEND_RULE.limit; i++) {
      const r = await send(i % 2 === 0 ? onA : onB, conv.id, `m${i}`);
      expect(r.ok).toBe(true);
    }
    const blocked = await send(onB, conv.id, "un de trop");
    expect(blocked).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });

    const count = await testDb.db
      .selectFrom("messages")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("conversation_id", "=", conv.id)
      .executeTakeFirstOrThrow();
    expect(Number(count.n)).toBe(MESSAGE_SEND_RULE.limit);
  });
});

describe("connexions simultanées", () => {
  it(`refuse la connexion n°${MAX_CONNECTIONS_PER_USER + 1} d'un même utilisateur, toutes instances confondues`, async () => {
    const bob = await registerUser(a.app, "bob");
    for (let i = 0; i < MAX_CONNECTIONS_PER_USER; i++) await open(i % 2 === 0 ? a : b, bob.accessToken);
    await expect(connect(b.url, bob.accessToken)).rejects.toThrow("RATE_LIMITED");

    // Une place se libère : la connexion est de nouveau acceptée.
    sockets.pop()?.close();
    await new Promise((r) => setTimeout(r, 200));
    await expect(open(a, bob.accessToken)).resolves.toBeDefined();
  });

  it("n'affecte pas les autres utilisateurs", async () => {
    const carol = await registerUser(a.app, "carol");
    await expect(open(b, carol.accessToken)).resolves.toBeDefined();
  });
});

describe("Redis indisponible", () => {
  it("bascule sur des compteurs en mémoire : la limite reste appliquée", async () => {
    const broken: RateLimiter = {
      hit: async () => {
        throw new Error("redis down");
      },
    };
    const errors: unknown[] = [];
    const limiter = new FallbackRateLimiter(broken, new MemoryRateLimiter(), (err) => errors.push(err));
    expect((await limiter.hit("k", 1, 1000)).allowed).toBe(true);
    expect((await limiter.hit("k", 1, 1000)).allowed).toBe(false);
    expect(errors).toHaveLength(2);
  });
});
