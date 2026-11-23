/**
 * Révocation de sessions, émise après le commit (architecture § 5.3, « déconnexion forcée »).
 * Le temps réel s'y abonne pour fermer les sockets ouvertes avec ces sessions.
 */
export interface SessionEvents {
  sessionsRevoked(sessionIds: string[]): Promise<void>;
}

export const noopSessionEvents: SessionEvents = {
  sessionsRevoked: async () => undefined,
};
