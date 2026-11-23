import { useEffect, useState } from "preact/hooks";
import { realtime, signOut } from "../../app/services";
import type { Session } from "../../lib/api";
import type { ConnectionState } from "../../lib/socket";
import { ChatView } from "../chat/ChatView";
import { MembersDialog } from "../conversations/MembersDialog";
import { NewConversationDialog } from "../conversations/NewConversationDialog";
import { previewOf, titleOf } from "../conversations/model";
import { useConversations } from "../conversations/useConversations";
import { ThemeToggle } from "../theme/ThemeToggle";
import styles from "./Shell.module.css";

export { titleOf } from "../conversations/model";

const CONNECTION_LABEL: Partial<Record<ConnectionState, string>> = {
  connecting: "Connexion au serveur…",
  reconnecting: "Connexion perdue. Reconnexion en cours…",
  disconnected: "Hors ligne.",
};

/**
 * Espace connecté : liste des conversations (sections Privées et Groupes, aperçu, non-lus en direct),
 * création d'une conversation, gestion des membres et vue de chat (issues #79 et #80).
 */
export function Shell({ session }: { session: Session }) {
  const meId = session.user.id;
  const state = useConversations(meId);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [dialog, setDialog] = useState<"new" | "members" | null>(null);

  useEffect(() => realtime.onState(setConnection), []);

  const selected = state.conversations.find((c) => c.id === state.selectedId) ?? null;
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
        <button type="button" class={styles.create} onClick={() => setDialog("new")}>
          + Créer une conversation
        </button>
        {state.error && (
          <p class={styles.error} role="alert">
            {state.error}
          </p>
        )}
        {(["private", "group"] as const).map((type) => {
          const list = state.conversations.filter((c) => c.type === type);
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
                        class={c.id === state.selectedId ? `${styles.item} ${styles.active}` : styles.item}
                        aria-current={c.id === state.selectedId ? "page" : undefined}
                        onClick={() => state.select(c.id)}
                      >
                        <span class={styles.itemText}>
                          <span class={styles.itemTitle}>{titleOf(c, meId)}</span>
                          <span class={styles.preview}>{previewOf(c, meId)}</span>
                        </span>
                        {c.unreadCount > 0 && c.id !== state.selectedId && (
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
        <ThemeToggle class={styles.theme} />
      </aside>

      <main class={styles.main}>
        {banner && (
          <p class={styles.banner} role="status">
            {banner}
          </p>
        )}
        {state.notice && (
          <p class={styles.notice} role="status">
            {state.notice}
          </p>
        )}
        {selected ? (
          <ChatView
            key={selected.id}
            conversation={selected}
            meId={meId}
            title={titleOf(selected, meId)}
            onRead={(seq) => {
              if (seq > selected.lastReadSeq) state.read(selected.id, seq);
            }}
            onShowMembers={selected.type === "group" ? () => setDialog("members") : undefined}
          />
        ) : (
          <p class={styles.placeholder}>Sélectionnez ou créez une conversation.</p>
        )}
      </main>

      {dialog === "new" && (
        <NewConversationDialog
          meId={meId}
          onClose={() => setDialog(null)}
          onCreated={(view) => {
            state.put(view);
            state.select(view.id);
            setDialog(null);
          }}
        />
      )}
      {dialog === "members" && selected && (
        <MembersDialog
          conversation={selected}
          meId={meId}
          onClose={() => setDialog(null)}
          onChanged={(view) => state.put(view)}
          onLeft={() => {
            setDialog(null);
            state.select(null);
          }}
        />
      )}
    </div>
  );
}
