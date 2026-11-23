import { useState } from "preact/hooks";
import { ConversationView, type MemberRole } from "@chatisen/shared";
import { api } from "../../app/services";
import { ApiError } from "../../lib/errors";
import { Dialog } from "./Dialog";
import { canAddMembers, memberActions, roleOf } from "./model";
import { UserSearch } from "./UserSearch";
import styles from "./Conversations.module.css";

const ROLE_LABEL: Record<MemberRole, string> = { owner: "Propriétaire", admin: "Admin", member: "Membre" };

/**
 * Gestion d'un groupe (FR-16) : ajout, retrait, départ, promotion et rétrogradation.
 * Seules les actions permises par le rôle sont proposées ; l'API revérifie chacune.
 */
export function MembersDialog({
  conversation,
  meId,
  onChanged,
  onLeft,
  onClose,
}: {
  conversation: ConversationView;
  meId: string;
  onChanged: (view: ConversationView) => void;
  onLeft: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myRole = roleOf(conversation, meId);
  const base = `/conversations/${conversation.id}/members`;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  const refresh = async () => onChanged(await api.request("GET", `/conversations/${conversation.id}`, ConversationView));

  return (
    <Dialog title={`Membres de ${conversation.title ?? "la conversation"}`} onClose={onClose}>
      <ul class={styles.members}>
        {conversation.members.map((m) => {
          const isMe = m.user.id === meId;
          const actions = memberActions(myRole, { role: m.role, isMe });
          return (
            <li key={m.user.id} class={styles.member}>
              <span class={styles.memberName}>
                {m.user.displayName}
                {isMe && " (vous)"} <span class={styles.muted}>@{m.user.username}</span>
              </span>
              <span class={styles.role}>{ROLE_LABEL[m.role]}</span>
              <span class={styles.memberActions}>
                {actions.promote && (
                  <button type="button" class={styles.secondary} disabled={busy}
                    onClick={() => void run(async () => onChanged(await api.request("PATCH", `${base}/${m.user.id}`, ConversationView, { role: "admin" })))}>
                    Nommer admin
                  </button>
                )}
                {actions.demote && (
                  <button type="button" class={styles.secondary} disabled={busy}
                    onClick={() => void run(async () => onChanged(await api.request("PATCH", `${base}/${m.user.id}`, ConversationView, { role: "member" })))}>
                    Retirer admin
                  </button>
                )}
                {actions.remove && (
                  <button type="button" class={`${styles.secondary} ${styles.danger}`} disabled={busy}
                    onClick={() => void run(async () => { await api.request("DELETE", `${base}/${m.user.id}`, null); await refresh(); })}>
                    Retirer
                  </button>
                )}
                {actions.leave && (
                  <button type="button" class={`${styles.secondary} ${styles.danger}`} disabled={busy}
                    onClick={() => void run(async () => { await api.request("DELETE", `${base}/${meId}`, null); onLeft(); })}>
                    Quitter le groupe
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {canAddMembers(myRole) && (
        <UserSearch
          id="add-member"
          label="Ajouter un membre"
          exclude={new Set(conversation.members.map((m) => m.user.id))}
          onPick={(u) => void run(async () => onChanged(await api.request("POST", base, ConversationView, { userId: u.id })))}
        />
      )}

      {error && (
        <p class={styles.error} role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
