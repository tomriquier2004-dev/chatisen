import { Value } from "@sinclair/typebox/value";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConversationView } from "@chatisen/shared";
import { createTestApp, registerUser, type RegisteredUser, type TestApp } from "../../test/app";
import type { MembershipEvents } from "./events";

let t: TestApp;
const recorded: string[] = [];
const events: MembershipEvents = {
  memberAdded: async (e) => void recorded.push(`added ${e.userId} to ${e.conversationId} as ${e.role}`),
  memberRoleChanged: async (e) => void recorded.push(`role ${e.userId} in ${e.conversationId} -> ${e.role}`),
  memberRemoved: async (e) => void recorded.push(`removed ${e.userId} from ${e.conversationId} (${e.reason})`),
};

beforeAll(async () => {
  t = await createTestApp({}, { membershipEvents: events });
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  recorded.length = 0;
});

function as(user: RegisteredUser) {
  const headers = { authorization: `Bearer ${user.accessToken}` };
  return {
    get: (url: string) => t.app.inject({ method: "GET", url: `/api/v1${url}`, headers }),
    post: (url: string, payload: object) => t.app.inject({ method: "POST", url: `/api/v1${url}`, headers, payload }),
    del: (url: string) => t.app.inject({ method: "DELETE", url: `/api/v1${url}`, headers }),
    patch: (url: string, payload: object) => t.app.inject({ method: "PATCH", url: `/api/v1${url}`, headers, payload }),
  };
}

async function group(owner: RegisteredUser, members: RegisteredUser[], title = "Projet DevOps") {
  const res = await as(owner).post("/conversations", { type: "group", title, memberIds: members.map((m) => m.user.id) });
  expect(res.statusCode).toBe(201);
  return res.json() as ConversationView;
}

describe("authentification", () => {
  it("refuse toutes les routes sans token", async () => {
    for (const [method, url] of [
      ["GET", "/api/v1/conversations"],
      ["POST", "/api/v1/conversations"],
      ["GET", "/api/v1/users?query=ab"],
    ] as const) {
      const res = await t.app.inject({ method, url });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("conversations privées", () => {
  it("crée une conversation à deux, puis renvoie la même au second appel", async () => {
    const alice = await registerUser(t.app, "alice");
    const bob = await registerUser(t.app, "bob");

    const first = await as(alice).post("/conversations", { type: "private", userId: bob.user.id });
    expect(first.statusCode).toBe(201);
    expect(Value.Check(ConversationView, first.json())).toBe(true);
    expect(first.json().members.map((m: { user: { id: string } }) => m.user.id).sort()).toEqual(
      [alice.user.id, bob.user.id].sort(),
    );

    // Bob ouvre la conversation de son côté : même conversation, pas de doublon.
    const second = await as(bob).post("/conversations", { type: "private", userId: alice.user.id });
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    expect(recorded).toHaveLength(2);
  });

  it("refuse une conversation avec soi-même ou avec un inconnu", async () => {
    const alice = await registerUser(t.app, "alice");
    expect((await as(alice).post("/conversations", { type: "private", userId: alice.user.id })).statusCode).toBe(400);
    const unknown = await as(alice).post("/conversations", { type: "private", userId: crypto.randomUUID() });
    expect(unknown.statusCode).toBe(404);
  });

  it("interdit d'ajouter un membre à une conversation privée", async () => {
    const alice = await registerUser(t.app, "alice");
    const bob = await registerUser(t.app, "bob");
    const carol = await registerUser(t.app, "carol");
    const conv = (await as(alice).post("/conversations", { type: "private", userId: bob.user.id })).json();
    const res = await as(alice).post(`/conversations/${conv.id}/members`, { userId: carol.user.id });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("NOT_A_GROUP");
  });
});

describe("groupes", () => {
  it("crée un groupe dont le créateur est propriétaire", async () => {
    const owner = await registerUser(t.app, "owner");
    const m1 = await registerUser(t.app, "m1");
    const view = await group(owner, [m1]);
    expect(view.type).toBe("group");
    expect(view.lastMessage).toBeNull();
    expect(view.title).toBe("Projet DevOps");
    expect(view.members).toEqual([
      { user: { id: owner.user.id, username: owner.user.username, displayName: owner.user.displayName }, role: "owner" },
      { user: { id: m1.user.id, username: m1.user.username, displayName: m1.user.displayName }, role: "member" },
    ]);
    expect(recorded).toEqual([
      `added ${owner.user.id} to ${view.id} as owner`,
      `added ${m1.user.id} to ${view.id} as member`,
    ]);
  });

  it("liste uniquement les conversations dont l'utilisateur est membre", async () => {
    const owner = await registerUser(t.app, "owner");
    const outsider = await registerUser(t.app, "outsider");
    const view = await group(owner, []);
    const mine = (await as(owner).get("/conversations")).json() as ConversationView[];
    const theirs = (await as(outsider).get("/conversations")).json() as ConversationView[];
    expect(mine.map((c) => c.id)).toContain(view.id);
    expect(theirs.map((c) => c.id)).not.toContain(view.id);
  });

  it("refuse le détail d'une conversation à un non-membre (FR-03)", async () => {
    const owner = await registerUser(t.app, "owner");
    const outsider = await registerUser(t.app, "outsider");
    const view = await group(owner, []);
    const res = await as(outsider).get(`/conversations/${view.id}`);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("CONVERSATION_FORBIDDEN");
  });
});

describe("gestion des membres (FR-16)", () => {
  it("le propriétaire ajoute un membre ; l'événement part après l'ajout", async () => {
    const owner = await registerUser(t.app, "owner");
    const newcomer = await registerUser(t.app, "newcomer");
    const view = await group(owner, []);
    recorded.length = 0;

    const res = await as(owner).post(`/conversations/${view.id}/members`, { userId: newcomer.user.id });
    expect(res.statusCode).toBe(201);
    expect(res.json().members).toHaveLength(2);
    expect(recorded).toEqual([`added ${newcomer.user.id} to ${view.id} as member`]);
    expect((await as(newcomer).get(`/conversations/${view.id}`)).statusCode).toBe(200);
  });

  it("refuse un doublon", async () => {
    const owner = await registerUser(t.app, "owner");
    const m1 = await registerUser(t.app, "m1");
    const view = await group(owner, [m1]);
    const res = await as(owner).post(`/conversations/${view.id}/members`, { userId: m1.user.id });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ALREADY_MEMBER");
  });

  it("un simple membre ne peut ni ajouter ni retirer", async () => {
    const owner = await registerUser(t.app, "owner");
    const m1 = await registerUser(t.app, "m1");
    const m2 = await registerUser(t.app, "m2");
    const outsider = await registerUser(t.app, "outsider");
    const view = await group(owner, [m1, m2]);
    expect((await as(m1).post(`/conversations/${view.id}/members`, { userId: outsider.user.id })).statusCode).toBe(403);
    expect((await as(m1).del(`/conversations/${view.id}/members/${m2.user.id}`)).statusCode).toBe(403);
  });

  it("un non-membre ne peut rien modifier", async () => {
    const owner = await registerUser(t.app, "owner");
    const outsider = await registerUser(t.app, "outsider");
    const view = await group(owner, []);
    const res = await as(outsider).post(`/conversations/${view.id}/members`, { userId: outsider.user.id });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("CONVERSATION_FORBIDDEN");
  });

  it("seul le propriétaire nomme un admin ; un admin ne retire que des membres", async () => {
    const owner = await registerUser(t.app, "owner");
    const admin = await registerUser(t.app, "admin");
    const admin2 = await registerUser(t.app, "admin2");
    const m1 = await registerUser(t.app, "m1");
    const view = await group(owner, [m1]);

    expect((await as(owner).post(`/conversations/${view.id}/members`, { userId: admin.user.id, role: "admin" })).statusCode).toBe(201);
    expect((await as(admin).post(`/conversations/${view.id}/members`, { userId: admin2.user.id, role: "admin" })).statusCode).toBe(403);
    expect((await as(owner).post(`/conversations/${view.id}/members`, { userId: admin2.user.id, role: "admin" })).statusCode).toBe(201);

    expect((await as(admin).del(`/conversations/${view.id}/members/${admin2.user.id}`)).statusCode).toBe(403);
    expect((await as(admin).del(`/conversations/${view.id}/members/${owner.user.id}`)).statusCode).toBe(403);
    expect((await as(admin).del(`/conversations/${view.id}/members/${m1.user.id}`)).statusCode).toBe(204);
  });

  it("le retrait coupe l'accès et émet l'événement", async () => {
    const owner = await registerUser(t.app, "owner");
    const m1 = await registerUser(t.app, "m1");
    const view = await group(owner, [m1]);
    recorded.length = 0;

    expect((await as(owner).del(`/conversations/${view.id}/members/${m1.user.id}`)).statusCode).toBe(204);
    expect(recorded).toEqual([`removed ${m1.user.id} from ${view.id} (removed)`]);
    expect((await as(m1).get(`/conversations/${view.id}`)).statusCode).toBe(403);
    expect(((await as(m1).get("/conversations")).json() as ConversationView[]).map((c) => c.id)).not.toContain(view.id);
  });

  it("un membre peut quitter ; si le propriétaire part, le plus ancien admin hérite", async () => {
    const owner = await registerUser(t.app, "owner");
    const m1 = await registerUser(t.app, "m1");
    const admin = await registerUser(t.app, "admin");
    const view = await group(owner, [m1]);
    await as(owner).post(`/conversations/${view.id}/members`, { userId: admin.user.id, role: "admin" });
    recorded.length = 0;

    expect((await as(owner).del(`/conversations/${view.id}/members/${owner.user.id}`)).statusCode).toBe(204);
    expect(recorded).toEqual([`removed ${owner.user.id} from ${view.id} (left)`]);
    const after = (await as(admin).get(`/conversations/${view.id}`)).json() as ConversationView;
    expect(after.members.find((m) => m.user.id === admin.user.id)?.role).toBe("owner");
    expect(after.members.find((m) => m.user.id === m1.user.id)?.role).toBe("member");
  });

  it("un groupe vidé de ses membres est supprimé", async () => {
    const owner = await registerUser(t.app, "owner");
    const view = await group(owner, []);
    expect((await as(owner).del(`/conversations/${view.id}/members/${owner.user.id}`)).statusCode).toBe(204);
    const row = await t.testDb.db.selectFrom("conversations").select("id").where("id", "=", view.id).executeTakeFirst();
    expect(row).toBeUndefined();
  });
});

describe("changement de rôle (PATCH /conversations/:id/members/:userId)", () => {
  it("le propriétaire nomme un admin puis le rétrograde ; l'événement part à chaque changement", async () => {
    const owner = await registerUser(t.app, "owner");
    const m1 = await registerUser(t.app, "m1");
    const view = await group(owner, [m1]);
    recorded.length = 0;

    const promote = await as(owner).patch(`/conversations/${view.id}/members/${m1.user.id}`, { role: "admin" });
    expect(promote.statusCode).toBe(200);
    expect((promote.json() as ConversationView).members.find((m) => m.user.id === m1.user.id)?.role).toBe("admin");
    // Même rôle : rien ne change, aucun événement.
    await as(owner).patch(`/conversations/${view.id}/members/${m1.user.id}`, { role: "admin" });
    await as(owner).patch(`/conversations/${view.id}/members/${m1.user.id}`, { role: "member" });
    expect(recorded).toEqual([
      `role ${m1.user.id} in ${view.id} -> admin`,
      `role ${m1.user.id} in ${view.id} -> member`,
    ]);
  });

  it("refuse à un admin, au propriétaire sur lui-même, et sur une conversation privée", async () => {
    const owner = await registerUser(t.app, "owner");
    const admin = await registerUser(t.app, "admin");
    const m1 = await registerUser(t.app, "m1");
    const view = await group(owner, [m1]);
    await as(owner).post(`/conversations/${view.id}/members`, { userId: admin.user.id, role: "admin" });

    expect((await as(admin).patch(`/conversations/${view.id}/members/${m1.user.id}`, { role: "admin" })).statusCode).toBe(403);
    expect((await as(owner).patch(`/conversations/${view.id}/members/${owner.user.id}`, { role: "member" })).statusCode).toBe(403);
    const priv = (await as(owner).post("/conversations", { type: "private", userId: m1.user.id })).json();
    const res = await as(owner).patch(`/conversations/${priv.id}/members/${m1.user.id}`, { role: "admin" });
    expect(res.json().error.code).toBe("NOT_A_GROUP");
  });

  it("refuse le rôle owner (transfert de propriété hors périmètre)", async () => {
    const owner = await registerUser(t.app, "owner");
    const m1 = await registerUser(t.app, "m1");
    const view = await group(owner, [m1]);
    expect((await as(owner).patch(`/conversations/${view.id}/members/${m1.user.id}`, { role: "owner" })).statusCode).toBe(400);
  });
});

describe("GET /users?query=", () => {
  it("trouve par nom d'utilisateur ou nom affiché, sans l'utilisateur courant", async () => {
    const me = await registerUser(t.app, "searcher");
    const target = await registerUser(t.app, "zebulon");
    const res = await as(me).get("/users?query=zebul");
    expect(res.statusCode).toBe(200);
    expect(res.json().map((u: { id: string }) => u.id)).toContain(target.user.id);
    const self = await as(me).get(`/users?query=${me.user.username}`);
    expect(self.json()).toEqual([]);
  });

  it("traite % et _ comme des caractères ordinaires", async () => {
    const me = await registerUser(t.app, "searcher");
    const res = await as(me).get("/users?query=%25%25");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
