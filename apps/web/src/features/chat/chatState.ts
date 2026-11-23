import type { Message } from "@chatisen/shared";

/** Message affiché : confirmé par le serveur, en cours d'envoi, ou en échec (à renvoyer). */
export type ChatItem =
  | { status: "sent"; message: Message }
  | { status: "pending" | "failed"; clientMsgId: string; body: string; senderId: string; error?: string };

export const keyOf = (item: ChatItem) => (item.status === "sent" ? item.message.clientMsgId : item.clientMsgId);

/**
 * Fusionne des messages confirmés dans la liste (historique, message:new, ack, rattrapage) :
 * - un message déjà présent (même id) n'est jamais dupliqué ;
 * - un message en attente est remplacé par sa version confirmée (même clientMsgId) ;
 * - l'ordre affiché est celui du `seq` serveur, jamais l'horloge du client ; les messages
 *   pas encore confirmés restent à la fin, dans leur ordre d'envoi (architecture § 6.2).
 */
export function mergeMessages(items: ChatItem[], incoming: Message[]): ChatItem[] {
  if (incoming.length === 0) return items;
  const confirmed = new Map<string, Message>();
  const pending: ChatItem[] = [];
  for (const item of items) {
    if (item.status === "sent") confirmed.set(item.message.id, item.message);
    else pending.push(item);
  }
  const confirmedClientIds = new Set<string>();
  for (const m of incoming) confirmed.set(m.id, m);
  for (const m of confirmed.values()) confirmedClientIds.add(m.clientMsgId);

  const sent: ChatItem[] = [...confirmed.values()]
    .sort((a, b) => a.seq - b.seq)
    .map((message) => ({ status: "sent", message }));
  return [...sent, ...pending.filter((p) => !confirmedClientIds.has(keyOf(p)))];
}

/** Ajoute un message en attente (envoi optimiste) ou repasse un message en échec en attente. */
export function addPending(items: ChatItem[], clientMsgId: string, body: string, senderId: string): ChatItem[] {
  const rest = items.filter((i) => keyOf(i) !== clientMsgId || i.status === "sent");
  return [...rest, { status: "pending", clientMsgId, body, senderId }];
}

export function markFailed(items: ChatItem[], clientMsgId: string, error: string): ChatItem[] {
  return items.map((i) => (i.status !== "sent" && i.clientMsgId === clientMsgId ? { ...i, status: "failed", error } : i));
}

/** Plus grand seq confirmé (0 si aucun) : point de départ du rattrapage après coupure. */
export function lastSeqOf(items: ChatItem[]): number {
  let max = 0;
  for (const i of items) if (i.status === "sent" && i.message.seq > max) max = i.message.seq;
  return max;
}

/** Plus petit seq chargé : borne `before` pour charger des messages plus anciens. */
export function firstSeqOf(items: ChatItem[]): number | undefined {
  for (const i of items) if (i.status === "sent") return i.message.seq;
  return undefined;
}
