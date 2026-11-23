import type { MembershipEvents } from "../modules/conversations/events";
import type { SessionEvents } from "../modules/auth/events";
import type { IoServer } from "./index";

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

  bind(io: IoServer): void {
    this.io = io;
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

  async memberRemoved(e: Parameters<MembershipEvents["memberRemoved"]>[0]): Promise<void> {
    if (!this.io) return;
    // 1. D'abord quitter la room : plus aucun message:new pour ce membre, sur toutes les instances.
    this.io.in(userRoom(e.userId)).socketsLeave(conversationRoom(e.conversationId));
    // 2. Puis prévenir le membre retiré (room user) et les membres restants (room conv).
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
