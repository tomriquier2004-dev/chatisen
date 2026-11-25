import type { MembershipEvents } from "../modules/conversations/events";
import type { SessionEvents } from "../modules/auth/events";
import type { IoServer } from "./index";
import type { Db } from "../db";

export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) => `conv:${conversationId}`;
export const sessionRoom = (sessionId: string) => `session:${sessionId}`;

/**
 * Rooms en direct (architecture § 5.3, issue #57). Appelé APRÈS le commit en base.
 *
 * Les opérations `socketsJoin` / `socketsLeave` / `disconnectSockets` sont relayées à toutes les
 * instances par l'adapter Redis, dans l'ordre de publication : l'événement de notification émis
 * juste après arrive donc à un client quand sa socket a déjà rejoint ou quitté la room.
 *
 * Créé avant le serveur Socket.IO (les routes REST en ont besoin à la construction de l'app),
 * puis relié à lui par `bind` ; avant cela, et sans temps réel, les appels ne font rien.
 */
export class RealtimeEvents implements MembershipEvents, SessionEvents {
  private io: IoServer | undefined;
  private db: Db | undefined;

  bind(io: IoServer, db?: Db): void {
    this.io = io;
    this.db = db;
  }

  async memberAdded(e: Parameters<MembershipEvents["memberAdded"]>[0]): Promise<void> {
    if (!this.io) return;
    // 1. Toutes les sockets du nouveau membre rejoignent la room, sans reconnexion.
    this.io.in(userRoom(e.userId)).socketsJoin(conversationRoom(e.conversationId));
    // 2. Notification : au membre ajouté et aux autres membres (Socket.IO déduplique les deux rooms).
    this.io
      .to([userRoom(e.userId), conversationRoom(e.conversationId)])
      .emit("conversation:member-added", { conversationId: e.conversationId, userId: e.userId, role: e.role, by: e.by });
  }

  async memberRoleChanged(e: Parameters<MembershipEvents["memberRoleChanged"]>[0]): Promise<void> {
    this.io
      ?.to(conversationRoom(e.conversationId))
      .emit("conversation:member-updated", { conversationId: e.conversationId, userId: e.userId, role: e.role, by: e.by });
  }

  async memberRemoved(e: Parameters<MembershipEvents["memberRemoved"]>[0]): Promise<void> {
    if (!this.io) return;
    // 1. D'abord quitter la room : plus aucun message:new pour ce membre, sur toutes les instances.
    this.io.in(userRoom(e.userId)).socketsLeave(conversationRoom(e.conversationId));
    // 2. Un retrait met immédiatement fin à tout appel actif dans cette conversation (§ 5.3).
    if (this.db) {
      const calls = await this.db.selectFrom("calls").select("id")
        .where("conversation_id", "=", e.conversationId).where("ended_at", "is", null).execute();
      for (const call of calls) {
        const ended = await this.db.transaction().execute(async (trx) => {
          const row = await trx.updateTable("calls").set({ ended_at: new Date(), end_reason: "removed" })
            .where("id", "=", call.id).where("ended_at", "is", null).returning("id").executeTakeFirst();
          if (!row) return false;
          await trx.updateTable("call_participants").set({ left_at: new Date() })
            .where("call_id", "=", call.id).where("left_at", "is", null).execute();
          return true;
        });
        if (!ended) continue;
        this.io.to([userRoom(e.userId), ... (await this.db.selectFrom("conversation_members").select("user_id")
          .where("conversation_id", "=", e.conversationId).execute()).map((m) => userRoom(m.user_id))])
          .emit("call:ended", { callId: call.id, reason: "removed" });
      }
    }
    // 3. Puis prévenir le membre retiré (room user) et les membres restants (room conv).
    this.io
      .to([userRoom(e.userId), conversationRoom(e.conversationId)])
      .emit("conversation:member-removed", {
        conversationId: e.conversationId,
        userId: e.userId,
        by: e.by,
        reason: e.reason,
      });
  }

  /** Déconnexion forcée des sockets ouvertes avec des sessions révoquées (logout, vol de refresh token). */
  async sessionsRevoked(sessionIds: string[]): Promise<void> {
    if (!this.io || sessionIds.length === 0) return;
    this.io.in(sessionIds.map(sessionRoom)).disconnectSockets(true);
  }
}
