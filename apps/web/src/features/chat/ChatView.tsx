import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { MessageBody, MessageHistory, type ConversationView } from "@chatisen/shared";
import { Value } from "@sinclair/typebox/value";
import { api, realtime } from "../../app/services";
import { ApiError } from "../../lib/errors";
import { addPending, firstSeqOf, keyOf, lastSeqOf, markFailed, mergeMessages, type ChatItem } from "./chatState";
import { MessageItem } from "./MessageItem";
import styles from "./Chat.module.css";

const PAGE = 50;

export interface ChatViewProps {
  conversation: ConversationView;
  meId: string;
  title: string;
}

/**
 * Vue de chat (issue #80) : historique paginé, envoi optimiste confirmé par le `seq` serveur,
 * réception en direct, rattrapage après coupure (géré par `Realtime`), erreurs lisibles (FR-18).
 */
export function ChatView({ conversation, meId, title }: ChatViewProps) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const olderRef = useRef<HTMLLIElement>(null);
  const loadingOlder = useRef(false);
  const stickToBottom = useRef(true);
  const conversationId = conversation.id;

  // Historique récent, puis abonnement au temps réel pour cette conversation.
  useEffect(() => {
    let active = true;
    setItems([]);
    setError(null);
    setLoading(true);
    stickToBottom.current = true;
    const unsubscribe = realtime.onMessage((m) => {
      if (m.conversationId === conversationId) setItems((prev) => mergeMessages(prev, [m]));
    });
    api
      .request("GET", `/conversations/${conversationId}/messages?limit=${PAGE}`, MessageHistory)
      .then((page) => {
        if (!active) return;
        setItems((prev) => mergeMessages(prev, page));
        setHasOlder(page.length === PAGE);
        realtime.track(conversationId, page.at(-1)?.seq ?? 0);
      })
      .catch((err: unknown) => active && setError(messageOf(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      unsubscribe();
      realtime.untrack(conversationId);
    };
  }, [conversationId]);

  // Suit les nouveaux messages en bas de liste, sauf si l'utilisateur lit plus haut.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  async function loadOlder() {
    const before = firstSeqOf(items);
    if (before === undefined || loadingOlder.current) return;
    loadingOlder.current = true;
    const el = listRef.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const page = await api.request(
        "GET",
        `/conversations/${conversationId}/messages?before=${before}&limit=${PAGE}`,
        MessageHistory,
      );
      stickToBottom.current = false;
      setItems((prev) => mergeMessages(prev, page));
      setHasOlder(page.length === PAGE);
      // Garde le même message sous les yeux après l'ajout au-dessus.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - fromBottom;
      });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      loadingOlder.current = false;
    }
  }

  // Chargement des messages plus anciens quand le haut de la liste devient visible au défilement.
  const loadOlderRef = useRef(loadOlder);
  loadOlderRef.current = loadOlder;
  useEffect(() => {
    const target = olderRef.current;
    if (!target || !hasOlder || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !stickToBottom.current) void loadOlderRef.current();
      },
      { root: listRef.current },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasOlder]);

  async function send(clientMsgId: string, body: string) {
    stickToBottom.current = true;
    setItems((prev) => addPending(prev, clientMsgId, body, meId));
    try {
      const message = await realtime.send({ conversationId, clientMsgId, body });
      setItems((prev) => mergeMessages(prev, [message]));
    } catch (err) {
      // Le message reste affiché avec « Réessayer » : le renvoi réutilise le même clientMsgId,
      // l'idempotence du serveur évite tout doublon s'il avait en fait été enregistré.
      setItems((prev) => markFailed(prev, clientMsgId, messageOf(err)));
    }
  }

  function submit(e: Event) {
    e.preventDefault();
    const body = draft.trim();
    if (!Value.Check(MessageBody, body)) return;
    setDraft("");
    void send(crypto.randomUUID(), body);
  }

  const names = new Map(conversation.members.map((m) => [m.user.id, m.user.displayName]));
  const sent = lastSeqOf(items);

  return (
    <section class={styles.chat} aria-labelledby="chat-title">
      <header class={styles.header}>
        <h2 id="chat-title" class={styles.title}>
          {title}
        </h2>
        <span class={styles.subtitle}>
          {conversation.type === "group" ? `${conversation.members.length} membres` : "Conversation privée"}
        </span>
      </header>

      <ol
        ref={listRef}
        class={styles.list}
        aria-label={`Messages de ${title}`}
        aria-live="polite"
        data-last-seq={sent}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {hasOlder && (
          <li class={styles.older} ref={olderRef}>
            <button type="button" class={styles.secondary} onClick={() => void loadOlder()}>
              Charger les messages plus anciens
            </button>
          </li>
        )}
        {loading && <li class={styles.notice}>Chargement…</li>}
        {!loading && items.length === 0 && !error && <li class={styles.notice}>Aucun message pour l'instant.</li>}
        {items.map((item, i) => {
          const author = item.status === "sent" ? item.message.senderId : item.senderId;
          const prev = items[i - 1];
          const prevAuthor = prev ? (prev.status === "sent" ? prev.message.senderId : prev.senderId) : null;
          return (
            <MessageItem
              key={keyOf(item)}
              item={item}
              authorName={names.get(author) ?? "Ancien membre"}
              isMine={author === meId}
              grouped={prevAuthor === author}
              onRetry={item.status === "failed" ? () => void send(item.clientMsgId, item.body) : undefined}
            />
          );
        })}
      </ol>

      {error && (
        <p class={styles.error} role="alert">
          {error}
        </p>
      )}

      <form class={styles.composer} onSubmit={submit}>
        <label class={styles.visuallyHidden} for="composer">
          Votre message
        </label>
        <textarea
          id="composer"
          class={styles.input}
          rows={1}
          maxLength={4000}
          placeholder={`Écrire à ${title}`}
          value={draft}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Entrée envoie, Maj+Entrée va à la ligne.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" class={styles.send} disabled={draft.trim().length === 0}>
          Envoyer
        </button>
      </form>
    </section>
  );
}

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : "Une erreur est survenue.";
}
