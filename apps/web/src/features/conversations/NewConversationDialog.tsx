import { useState } from "preact/hooks";
import { ConversationView, GroupTitle, MAX_GROUP_MEMBERS, type PublicUser } from "@chatisen/shared";
import { Value } from "@sinclair/typebox/value";
import { api } from "../../app/services";
import { ApiError } from "../../lib/errors";
import { Dialog } from "./Dialog";
import { UserSearch } from "./UserSearch";
import styles from "./Conversations.module.css";

type Kind = "private" | "group";

/**
 * « + Créer une conversation » (design system § 5.1) : choix explicite entre conversation privée
 * et groupe, recherche des personnes, création par l'API (FR-06).
 */
export function NewConversationDialog({
  meId,
  onCreated,
  onClose,
}: {
  meId: string;
  onCreated: (view: ConversationView) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>("private");
  const [title, setTitle] = useState("");
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(body: object) {
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.request("POST", "/conversations", ConversationView, body));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  }

  const exclude = new Set([meId, ...members.map((m) => m.id)]);

  return (
    <Dialog title="Créer une conversation" onClose={onClose}>
      <div class={styles.choice} role="radiogroup" aria-label="Type de conversation">
        {(["private", "group"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            class={kind === k ? `${styles.choiceItem} ${styles.choiceActive}` : styles.choiceItem}
            onClick={() => setKind(k)}
          >
            {k === "private" ? "Conversation privée" : "Groupe"}
          </button>
        ))}
      </div>

      {kind === "private" ? (
        <UserSearch
          id="new-private"
          label="Avec qui ?"
          exclude={exclude}
          onPick={(u) => void create({ type: "private", userId: u.id })}
        />
      ) : (
        <form
          class={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (!Value.Check(GroupTitle, title.trim())) return setError("Donnez un nom au groupe (64 caractères max).");
            void create({ type: "group", title: title.trim(), memberIds: members.map((m) => m.id) });
          }}
        >
          <label class={styles.label} for="group-title">
            Nom du groupe
          </label>
          <input
            id="group-title"
            class={styles.input}
            maxLength={64}
            value={title}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
          {members.length > 0 && (
            <ul class={styles.chips} aria-label="Membres choisis">
              {members.map((m) => (
                <li key={m.id} class={styles.chip}>
                  {m.displayName}
                  <button
                    type="button"
                    class={styles.chipRemove}
                    aria-label={`Retirer ${m.displayName}`}
                    onClick={() => setMembers(members.filter((x) => x.id !== m.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {members.length < MAX_GROUP_MEMBERS - 1 && (
            <UserSearch id="new-group" label="Ajouter des membres" exclude={exclude} onPick={(u) => setMembers([...members, u])} />
          )}
          <button type="submit" class={styles.primary} disabled={busy}>
            {busy ? "Création…" : "Créer le groupe"}
          </button>
        </form>
      )}

      {error && (
        <p class={styles.error} role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
