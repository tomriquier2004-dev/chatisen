import { sql } from "kysely";
import { MAX_GROUP_MEMBERS, type ConversationView, type MemberRole, type PublicUser } from "@chatisen/shared";
import type { Db } from "../../db";
import { AppError, forbidden, notFound } from "../../errors";

export const conversationForbidden = () =>
  new AppError(403, "CONVERSATION_FORBIDDEN", "Vous n'êtes pas membre de cette conversation");

/** Rôle de l'utilisateur dans la conversation, ou undefined s'il n'en est pas membre. */
export async function membershipOf(db: Db, conversationId: string, userId: string): Promise<MemberRole | undefined> {
  const row = await db
    .selectFrom("conversation_members")
    .select("role")
    .where("conversation_id", "=", conversationId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return row?.role;
}

/** Contrôle d'accès côté serveur (FR-03) : lève CONVERSATION_FORBIDDEN si l'utilisateur n'est pas membre. */
export async function requireMember(db: Db, conversationId: string, userId: string): Promise<MemberRole> {
  const role = await membershipOf(db, conversationId, userId);
  if (!role) throw conversationForbidden();
  return role;
}

/** Vues des conversations de `userId` (toutes, ou celles de `ids`), membres compris, en deux requêtes. */
export async function conversationViews(db: Db, userId: string, ids?: string[]): Promise<ConversationView[]> {
  let query = db
    .selectFrom("conversations as c")
    .innerJoin("conversation_members as me", (j) =>
      j.onRef("me.conversation_id", "=", "c.id").on("me.user_id", "=", userId),
    )
    .select(["c.id", "c.type", "c.title", "c.last_seq", "c.created_at", "me.last_read_seq"])
    .orderBy("c.created_at", "desc");
  if (ids) {
    if (ids.length === 0) return [];
    query = query.where("c.id", "in", ids);
  }
  const conversations = await query.execute();
  if (conversations.length === 0) return [];

  const members = await db
    .selectFrom("conversation_members as m")
    .innerJoin("users as u", "u.id", "m.user_id")
    .select(["m.conversation_id", "m.role", "m.joined_at", "u.id", "u.username", "u.display_name"])
    .where(
      "m.conversation_id",
      "in",
      conversations.map((c) => c.id),
    )
    .orderBy("m.joined_at")
    .execute();

  // Dernier message de chaque conversation, en une requête (DISTINCT ON + index (conversation_id, seq)).
  const lastMessages = await db
    .selectFrom("messages")
    .selectAll()
    .distinctOn("conversation_id")
    .where(
      "conversation_id",
      "in",
      conversations.map((c) => c.id),
    )
    .orderBy("conversation_id")
    .orderBy("seq", "desc")
    .execute();
  const lastByConversation = new Map(lastMessages.map((m) => [m.conversation_id, m]));

  const byConversation = new Map<string, ConversationView["members"]>();
  for (const m of members) {
    const list = byConversation.get(m.conversation_id) ?? [];
    list.push({ user: { id: m.id, username: m.username, displayName: m.display_name }, role: m.role });
    byConversation.set(m.conversation_id, list);
  }

  const views: ConversationView[] = conversations.map((c) => {
    const last = lastByConversation.get(c.id);
    return {
    id: c.id,
    type: c.type,
    title: c.title,
    members: byConversation.get(c.id) ?? [],
    lastSeq: c.last_seq,
    lastReadSeq: c.last_read_seq,
    unreadCount: Math.max(0, c.last_seq - c.last_read_seq),
    lastMessage: last
      ? {
          id: last.id,
          conversationId: last.conversation_id,
          senderId: last.sender_id,
          seq: last.seq,
          clientMsgId: last.client_msg_id,
          body: last.body,
          createdAt: toIso(last.created_at),
        }
      : null,
    createdAt: toIso(c.created_at),
    };
  });
  // Les plus récemment actives en premier (dernier message, sinon création).
  const activity = (v: ConversationView) => v.lastMessage?.createdAt ?? v.createdAt;
  return views.sort((a, b) => activity(b).localeCompare(activity(a)));
}

export async function conversationView(db: Db, userId: string, conversationId: string): Promise<ConversationView> {
  const [view] = await conversationViews(db, userId, [conversationId]);
  if (!view) throw conversationForbidden();
  return view;
}

async function requireUsersExist(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await db.selectFrom("users").select("id").where("id", "in", ids).execute();
  if (found.length !== new Set(ids).size) throw notFound("Utilisateur introuvable");
}

/** Conversation privée entre deux utilisateurs : renvoie l'existante si elle existe déjà (une seule par paire). */
export async function openPrivateConversation(
  db: Db,
  userId: string,
  otherId: string,
): Promise<{ id: string; created: boolean }> {
  if (otherId === userId) throw new AppError(400, "VALIDATION_FAILED", "Impossible d'ouvrir une conversation avec soi-même");
  await requireUsersExist(db, [otherId]);
  const privateKey = [userId, otherId].sort().join(":");

  return db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto("conversations")
      .values({ type: "private", private_key: privateKey })
      .onConflict((oc) => oc.column("private_key").doNothing())
      .returning("id")
      .executeTakeFirst();
    if (!inserted) {
      const existing = await trx
        .selectFrom("conversations")
        .select("id")
        .where("private_key", "=", privateKey)
        .executeTakeFirstOrThrow();
      return { id: existing.id, created: false };
    }
    await trx
      .insertInto("conversation_members")
      .values([
        { conversation_id: inserted.id, user_id: userId, role: "member" },
        { conversation_id: inserted.id, user_id: otherId, role: "member" },
      ])
      .execute();
    return { id: inserted.id, created: true };
  });
}

export async function createGroup(db: Db, ownerId: string, title: string, memberIds: string[]): Promise<string> {
  const others = [...new Set(memberIds)].filter((id) => id !== ownerId);
  await requireUsersExist(db, others);
  return db.transaction().execute(async (trx) => {
    const conv = await trx
      .insertInto("conversations")
      .values({ type: "group", title })
      .returning("id")
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("conversation_members")
      .values([
        { conversation_id: conv.id, user_id: ownerId, role: "owner" },
        ...others.map((id) => ({ conversation_id: conv.id, user_id: id, role: "member" as const })),
      ])
      .execute();
    return conv.id;
  });
}

async function requireGroup(db: Db, conversationId: string): Promise<void> {
  const conv = await db.selectFrom("conversations").select("type").where("id", "=", conversationId).executeTakeFirst();
  if (!conv) throw notFound("Conversation introuvable");
  if (conv.type !== "group") throw new AppError(409, "NOT_A_GROUP", "Les membres d'une conversation privée sont fixes");
}

/**
 * Ajout d'un membre (FR-16) : réservé au propriétaire et aux admins ; seul le propriétaire nomme un admin.
 */
export async function addMember(
  db: Db,
  actorId: string,
  conversationId: string,
  userId: string,
  role: "admin" | "member",
): Promise<void> {
  const actorRole = await requireMember(db, conversationId, actorId);
  await requireGroup(db, conversationId);
  if (actorRole === "member") throw forbidden("Seuls le propriétaire et les admins ajoutent des membres");
  if (role === "admin" && actorRole !== "owner") throw forbidden("Seul le propriétaire nomme un admin");
  await requireUsersExist(db, [userId]);

  const count = await db
    .selectFrom("conversation_members")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("conversation_id", "=", conversationId)
    .executeTakeFirstOrThrow();
  if (Number(count.n) >= MAX_GROUP_MEMBERS) throw new AppError(409, "VALIDATION_FAILED", "Groupe complet");

  const inserted = await db
    .insertInto("conversation_members")
    .values({ conversation_id: conversationId, user_id: userId, role })
    .onConflict((oc) => oc.columns(["conversation_id", "user_id"]).doNothing())
    .returning("user_id")
    .executeTakeFirst();
  if (!inserted) throw new AppError(409, "ALREADY_MEMBER", "Déjà membre de la conversation");
}

/**
 * Changement de rôle (FR-16) : réservé au propriétaire, sur un autre membre qui n'est pas propriétaire.
 * Renvoie true si le rôle a changé.
 */
export async function changeRole(
  db: Db,
  actorId: string,
  conversationId: string,
  userId: string,
  role: "admin" | "member",
): Promise<boolean> {
  const actorRole = await requireMember(db, conversationId, actorId);
  await requireGroup(db, conversationId);
  if (actorRole !== "owner") throw forbidden("Seul le propriétaire change les rôles");
  if (userId === actorId) throw forbidden("Le propriétaire ne change pas son propre rôle");
  const targetRole = await membershipOf(db, conversationId, userId);
  if (!targetRole) throw notFound("Cet utilisateur n'est pas membre de la conversation");
  if (targetRole === role) return false;
  await db
    .updateTable("conversation_members")
    .set({ role })
    .where("conversation_id", "=", conversationId)
    .where("user_id", "=", userId)
    .execute();
  return true;
}

/**
 * Retrait d'un membre, ou départ volontaire quand `userId === actorId`.
 * - le propriétaire retire n'importe qui ; un admin retire seulement des « member » ;
 * - si le dernier propriétaire part, le membre le plus ancien (admin d'abord) devient propriétaire ;
 * - un groupe vidé de ses membres est supprimé.
 */
export async function removeMember(
  db: Db,
  actorId: string,
  conversationId: string,
  userId: string,
): Promise<{ reason: "removed" | "left"; conversationDeleted: boolean }> {
  const actorRole = await requireMember(db, conversationId, actorId);
  await requireGroup(db, conversationId);
  const leaving = actorId === userId;

  const targetRole = leaving ? actorRole : await membershipOf(db, conversationId, userId);
  if (!targetRole) throw notFound("Cet utilisateur n'est pas membre de la conversation");
  if (!leaving) {
    if (actorRole === "member") throw forbidden("Seuls le propriétaire et les admins retirent des membres");
    if (actorRole === "admin" && targetRole !== "member") throw forbidden("Un admin ne retire que des membres");
  }

  return db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom("conversation_members")
      .where("conversation_id", "=", conversationId)
      .where("user_id", "=", userId)
      .execute();

    const remaining = await trx
      .selectFrom("conversation_members")
      .select(["user_id", "role"])
      .where("conversation_id", "=", conversationId)
      // Ordre de succession : owner, puis admin, puis member, puis ancienneté.
      .orderBy(sql`CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`)
      .orderBy("joined_at")
      .execute();

    if (remaining.length === 0) {
      await trx.deleteFrom("conversations").where("id", "=", conversationId).execute();
      return { reason: leaving ? "left" : "removed", conversationDeleted: true };
    }
    if (targetRole === "owner" && !remaining.some((m) => m.role === "owner")) {
      await trx
        .updateTable("conversation_members")
        .set({ role: "owner" })
        .where("conversation_id", "=", conversationId)
        .where("user_id", "=", remaining[0]!.user_id)
        .execute();
    }
    return { reason: leaving ? "left" : "removed", conversationDeleted: false };
  });
}

export async function searchUsers(db: Db, query: string, excludeId: string): Promise<PublicUser[]> {
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .selectFrom("users")
    .select(["id", "username", "display_name"])
    .where("id", "!=", excludeId)
    .where((eb) => eb.or([eb("username", "ilike", pattern), eb("display_name", "ilike", pattern)]))
    .orderBy("username")
    .limit(20)
    .execute();
  return rows.map((r) => ({ id: r.id, username: r.username, displayName: r.display_name }));
}

/** pg renvoie les timestamptz en Date ; le contrat les expose en ISO 8601. */
export function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
