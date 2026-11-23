import { sql } from "kysely";
import { SYNC_LIMIT, type Message, type MessageSendPayload } from "@chatisen/shared";
import type { Db } from "../../db";
import type { Message as MessageRow } from "../../db/schema";
import { AppError } from "../../errors";
import { toIso } from "../conversations/service";

const PG_UNIQUE_VIOLATION = "23505";

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    seq: row.seq,
    clientMsgId: row.client_msg_id,
    body: row.body,
    createdAt: toIso(row.created_at),
  };
}

async function findByClientMsgId(db: Db, conversationId: string, clientMsgId: string): Promise<MessageRow | undefined> {
  return db
    .selectFrom("messages")
    .selectAll()
    .where("conversation_id", "=", conversationId)
    .where("client_msg_id", "=", clientMsgId)
    .executeTakeFirst();
}

/**
 * Enregistre un message (architecture § 4 et § 6.2). L'appelant a vérifié l'appartenance.
 * - seq attribué dans la même transaction que l'insertion (`UPDATE … last_seq + 1 RETURNING`) ;
 * - idempotent sur (conversation, clientMsgId) : un renvoi après coupure renvoie le message déjà
 *   stocké avec `created: false`, sans doublon ni nouvelle diffusion (FR-17, FR-18) ;
 * - seulement pour le même expéditeur : un clientMsgId déjà pris par un autre membre est refusé,
 *   sans jamais renvoyer le message de quelqu'un d'autre (issue #74).
 */
export async function storeMessage(
  db: Db,
  senderId: string,
  payload: MessageSendPayload,
): Promise<{ message: Message; created: boolean }> {
  const existing = await findByClientMsgId(db, payload.conversationId, payload.clientMsgId);
  if (existing) return replay(existing, senderId);

  try {
    const row = await db.transaction().execute(async (trx) => {
      const { last_seq } = await trx
        .updateTable("conversations")
        .set((eb) => ({ last_seq: eb("last_seq", "+", 1) }))
        .where("id", "=", payload.conversationId)
        .returning("last_seq")
        .executeTakeFirstOrThrow();
      return trx
        .insertInto("messages")
        .values({
          conversation_id: payload.conversationId,
          sender_id: senderId,
          seq: last_seq,
          client_msg_id: payload.clientMsgId,
          body: payload.body,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    return { message: toMessage(row), created: true };
  } catch (err) {
    // Deux envois simultanés du même clientMsgId : le second échoue sur la contrainte unique,
    // sa transaction (y compris l'incrément de seq) est annulée, et on renvoie le premier.
    if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      const winner = await findByClientMsgId(db, payload.conversationId, payload.clientMsgId);
      if (winner) return replay(winner, senderId);
    }
    throw err;
  }
}

/** Renvoi d'un message déjà stocké : autorisé seulement pour son propre expéditeur. */
function replay(existing: MessageRow, senderId: string): { message: Message; created: false } {
  if (existing.sender_id !== senderId) {
    throw new AppError(409, "VALIDATION_FAILED", "clientMsgId déjà utilisé dans cette conversation");
  }
  return { message: toMessage(existing), created: false };
}

/** Page d'historique : `limit` messages de seq < `before` (ou les plus récents), triés par seq croissant. */
export async function messageHistory(
  db: Db,
  conversationId: string,
  before: number | undefined,
  limit: number,
): Promise<Message[]> {
  let query = db
    .selectFrom("messages")
    .selectAll()
    .where("conversation_id", "=", conversationId)
    .orderBy("seq", "desc")
    .limit(limit);
  if (before !== undefined) query = query.where("seq", "<", before);
  const rows = await query.execute();
  return rows.reverse().map(toMessage);
}

/** Messages postérieurs à `afterSeq`, dans l'ordre, pour le rattrapage après coupure (FR-17). */
export async function messagesAfter(db: Db, conversationId: string, afterSeq: number): Promise<Message[]> {
  const rows = await db
    .selectFrom("messages")
    .selectAll()
    .where("conversation_id", "=", conversationId)
    .where("seq", ">", afterSeq)
    .orderBy("seq", "asc")
    .limit(SYNC_LIMIT)
    .execute();
  return rows.map(toMessage);
}

/** Avance last_read_seq de l'utilisateur (jamais en arrière, jamais au-delà de last_seq). */
export async function markRead(db: Db, conversationId: string, userId: string, seq: number): Promise<{ lastReadSeq: number }> {
  const row = await db
    .updateTable("conversation_members as m")
    .from("conversations as c")
    .set({ last_read_seq: sql`GREATEST(m.last_read_seq, LEAST(${seq}::bigint, c.last_seq))` })
    .whereRef("c.id", "=", "m.conversation_id")
    .where("m.conversation_id", "=", conversationId)
    .where("m.user_id", "=", userId)
    .returning("m.last_read_seq")
    .executeTakeFirstOrThrow();
  return { lastReadSeq: row.last_read_seq };
}
