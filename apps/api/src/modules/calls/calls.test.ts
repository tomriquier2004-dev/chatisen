import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, registerUser, type RegisteredUser, type TestApp } from "../../test/app";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ RATE_LIMIT_ENABLED: "true" });
});

afterAll(async () => {
  await t.close();
});

function as(user: RegisteredUser) {
  const headers = { authorization: `Bearer ${user.accessToken}` };
  return (callId: string, payload: object) =>
    t.app.inject({ method: "POST", url: `/api/v1/calls/${callId}/quality`, headers, payload });
}

async function createCall(initiator: RegisteredUser, recipient: RegisteredUser, otherMember?: RegisteredUser) {
  const members = [initiator, recipient, ...(otherMember ? [otherMember] : [])];
  const conversation = await t.testDb.db
    .insertInto("conversations")
    .values({ type: "group", title: `call-${randomUUID().slice(0, 8)}` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await t.testDb.db
    .insertInto("conversation_members")
    .values(members.map((member, index) => ({
      conversation_id: conversation.id,
      user_id: member.user.id,
      role: index === 0 ? "owner" as const : "member" as const,
    })))
    .execute();
  const call = await t.testDb.db
    .insertInto("calls")
    .values({ conversation_id: conversation.id, media: "audio", initiator_id: initiator.user.id })
    .returning("id")
    .executeTakeFirstOrThrow();
  await t.testDb.db
    .insertInto("call_participants")
    .values([
      { call_id: call.id, user_id: initiator.user.id },
      { call_id: call.id, user_id: recipient.user.id },
    ])
    .execute();
  return call.id;
}

const sample = {
  rttMs: 48.5,
  jitterMs: 3.2,
  packetLossPct: 0.5,
  bitrateKbps: 900,
  candidateType: "relay",
};

describe("POST /calls/:id/quality (FR-13, NFR-04)", () => {
  it("enregistre les mesures sous l'identité authentifiée", async () => {
    const alice = await registerUser(t.app, "quality-alice");
    const bob = await registerUser(t.app, "quality-bob");
    const callId = await createCall(alice, bob);

    const res = await as(alice)(callId, { samples: [sample, { ...sample, candidateType: "host" }] });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 2 });

    const rows = await t.testDb.db
      .selectFrom("call_quality_samples")
      .select(["user_id", "candidate_type", "rtt_ms"])
      .where("call_id", "=", callId)
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.user_id === alice.user.id)).toBe(true);
    expect(rows.map((row) => row.candidate_type)).toEqual(["relay", "host"]);
  });

  it("refuse un membre de la conversation qui ne participe pas à cet appel", async () => {
    const alice = await registerUser(t.app, "quality-owner");
    const bob = await registerUser(t.app, "quality-peer");
    const carol = await registerUser(t.app, "quality-member");
    const callId = await createCall(alice, bob, carol);

    const res = await as(carol)(callId, { samples: [sample] });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    const rows = await t.testDb.db
      .selectFrom("call_quality_samples")
      .select("id")
      .where("call_id", "=", callId)
      .execute();
    expect(rows).toHaveLength(0);
  });

  it("refuse un utilisateur extérieur à l'appel", async () => {
    const alice = await registerUser(t.app, "quality-a");
    const bob = await registerUser(t.app, "quality-b");
    const outsider = await registerUser(t.app, "quality-outsider");
    const callId = await createCall(alice, bob);

    expect((await as(outsider)(callId, { samples: [sample] })).statusCode).toBe(403);
  });

  it("n'accepte pas de userId fourni par le client", async () => {
    const alice = await registerUser(t.app, "quality-spoof");
    const bob = await registerUser(t.app, "quality-peer");
    const callId = await createCall(alice, bob);

    const res = await as(alice)(callId, { userId: bob.user.id, samples: [sample] });
    expect(res.statusCode).toBe(400);
  });

  it("borne la taille du lot et valide les valeurs", async () => {
    const alice = await registerUser(t.app, "quality-bounds");
    const bob = await registerUser(t.app, "quality-peer");
    const callId = await createCall(alice, bob);

    expect((await as(alice)(callId, { samples: Array.from({ length: 61 }, () => sample) })).statusCode).toBe(400);
    expect((await as(alice)(callId, { samples: [{ ...sample, packetLossPct: 101 }] })).statusCode).toBe(400);
  });

  it("limite la fréquence des lots par utilisateur", async () => {
    const alice = await registerUser(t.app, "quality-rate");
    const bob = await registerUser(t.app, "quality-peer");
    const callId = await createCall(alice, bob);

    for (let i = 0; i < 30; i++) {
      expect((await as(alice)(callId, { samples: [sample] })).statusCode).toBe(202);
    }
    const limited = await as(alice)(callId, { samples: [sample] });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
  });
});
