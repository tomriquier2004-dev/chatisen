import type { MemberRole } from "@chatisen/shared";

/**
 * Changements d'appartenance, émis APRÈS le commit en base (architecture § 5.3).
 * Le temps réel (Socket.IO) s'y abonne pour faire rejoindre ou quitter les rooms en direct ;
 * sans temps réel, l'implémentation par défaut ne fait rien.
 */
export interface MembershipEvents {
  memberAdded(e: { conversationId: string; userId: string; role: MemberRole; by: string }): Promise<void>;
  memberRemoved(e: {
    conversationId: string;
    userId: string;
    by: string;
    reason: "removed" | "left" | "deleted";
  }): Promise<void>;
}

export const noopMembershipEvents: MembershipEvents = {
  memberAdded: async () => undefined,
  memberRemoved: async () => undefined,
};
