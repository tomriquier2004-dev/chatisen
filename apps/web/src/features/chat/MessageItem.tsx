import type { ChatItem } from "./chatState";
import styles from "./Chat.module.css";

export interface MessageItemProps {
  item: ChatItem;
  authorName: string;
  isMine: boolean;
  /** Même auteur que le message précédent : en-tête masqué, espacement réduit (design system § 4). */
  grouped: boolean;
  onRetry?: () => void;
}

const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

/**
 * Un message, présentation éditoriale sans bulle (design system § 5.3).
 * Le corps est rendu comme du **texte** : Preact échappe tout HTML, et aucun
 * `dangerouslySetInnerHTML` n'est utilisé (protection XSS, architecture § 9).
 */
export function MessageItem({ item, authorName, isMine, grouped, onRetry }: MessageItemProps) {
  const body = item.status === "sent" ? item.message.body : item.body;
  const classes = [styles.message, grouped ? styles.grouped : "", isMine ? styles.mine : ""].join(" ");
  return (
    <li class={classes}>
      {grouped ? (
        <span class={styles.avatarSpacer} aria-hidden="true" />
      ) : (
        <span class={styles.avatar} aria-hidden="true">
          {initials(authorName)}
        </span>
      )}
      <div class={styles.content}>
        {!grouped && (
          <div class={styles.meta}>
            <span class={styles.author}>{isMine ? "Vous" : authorName}</span>
            {item.status === "sent" && (
              <time class={styles.time} dateTime={item.message.createdAt}>
                {timeFormat.format(new Date(item.message.createdAt))}
              </time>
            )}
          </div>
        )}
        <p class={styles.body}>{body}</p>
        {item.status === "pending" && <span class={styles.state}>Envoi…</span>}
        {item.status === "failed" && (
          <span class={`${styles.state} ${styles.failed}`} role="alert">
            {item.error ?? "Non envoyé."}{" "}
            <button type="button" class={styles.retry} onClick={onRetry}>
              Réessayer
            </button>
          </span>
        )}
      </div>
    </li>
  );
}
