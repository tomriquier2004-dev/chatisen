import { useEffect, useState } from "preact/hooks";
import { ConversationList, type ConversationView } from "@chatisen/shared";
import { api, realtime, signOut } from "../../app/services";
import type { Session } from "../../lib/api";
import { ApiError } from "../../lib/errors";
import type { ConnectionState } from "../../lib/socket";
import { ChatView } from "../chat/ChatView";
import styles from "./Shell.module.css";

/** Titre affiché : celui du groupe, ou le nom de l'autre membre d'une conversation privée. */
export function titleOf(conversation: ConversationView, meId: string): string {
  if (conversation.title) return conversation.title;
  return conversation.members.find((m) => m.user.id !== meId)?.user.displayName ?? "Conversation";
}

const CONNECTION_LABEL: Partial<Record<ConnectionState, string>> = {
  connecting: "Connexion au serveur…",
  reconnecting: "Connexion perdue. Reconnexion en cours…",
  disconnected: "Hors ligne.",
};

/**
 * Espace connecté : liste des conversations (sections Privées et Groupes, design system § 5.2)
 * et vue de chat. La création et la gestion des membres viennent avec l'issue #79.
 */
export function Shell({ session }: { session: Session }) {
  const meId = session.user.id;
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");

  useEffect(() => realtime.onState(setConnection), []);

  useEffect(() => {
    api
      .request("GET", "/conversations", ConversationList)
      .then((list) => {
        setConversations(list);
        setSelectedId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Chargement impossible."));
  }, []);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const banner = CONNECTION_LABEL[connection];

  return (
    <div class={styles.shell}>
      <aside class={styles.sidebar} aria-label="Conversations">
        <div class={styles.me}>
          <span class={styles.meName}>{session.user.displayName}</span>
          <button type="button" class={styles.link} onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </div>
        {error && (
          <p class={styles.error} role="alert">
            {error}
          </p>
        )}
        {(["private", "group"] as const).map((type) => {
          const list = conversations.filter((c) => c.type === type);
          return (
            <nav key={type} aria-labelledby={`section-${type}`}>
              <h2 id={`section-${type}`} class={styles.section}>
                {type === "private" ? "Privées" : "Groupes"}
              </h2>
              {list.length === 0 ? (
                <p class={styles.empty}>Aucune conversation.</p>
              ) : (
                <ul class={styles.items}>
                  {list.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        class={c.id === selectedId ? `${styles.item} ${styles.active}` : styles.item}
                        aria-current={c.id === selectedId ? "page" : undefined}
                        onClick={() => setSelectedId(c.id)}
                      >
                        <span class={styles.itemTitle}>{titleOf(c, meId)}</span>
                        {c.unreadCount > 0 && c.id !== selectedId && (
                          <span class={styles.badge} aria-label={`${c.unreadCount} non lus`}>
                            {c.unreadCount}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
          );
        })}
      </aside>

      <main class={styles.main}>
        {banner && (
          <p class={styles.banner} role="status">
            {banner}
          </p>
        )}
        {selected ? (
          <ChatView key={selected.id} conversation={selected} meId={meId} title={titleOf(selected, meId)} />
        ) : (
          <p class={styles.placeholder}>Sélectionnez une conversation.</p>
        )}
      </main>
    </div>
  );
}
