import type { ConversationView, MemberRole, Message } from "@chatisen/shared";

/** Plus récente activité d'abord (dernier message, sinon création) : même tri que l'API. */
export function sortByActivity(list: ConversationView[]): ConversationView[] {
  const activity = (c: ConversationView) => c.lastMessage?.createdAt ?? c.createdAt;
  return [...list].sort((a, b) => activity(b).localeCompare(activity(a)));
}

/** Remplace (ou ajoute) une conversation, puis retrie. */
export function upsert(list: ConversationView[], view: ConversationView): ConversationView[] {
  return sortByActivity([...list.filter((c) => c.id !== view.id), view]);
}

export function remove(list: ConversationView[], conversationId: string): ConversationView[] {
  return list.filter((c) => c.id !== conversationId);
}

/**
 * Nouveau message : aperçu mis à jour, conversation remontée en tête, et non-lus incrémentés
 * sauf si c'est notre propre message ou la conversation ouverte à l'écran.
 */
export function applyMessage(
  list: ConversationView[],
  message: Message,
  meId: string,
  openId: string | null,
): ConversationView[] {
  const conv = list.find((c) => c.id === message.conversationId);
  if (!conv || (conv.lastMessage && conv.lastMessage.seq >= message.seq)) return list;
  const read = message.senderId === meId || message.conversationId === openId;
  return upsert(list, {
    ...conv,
    lastMessage: message,
    lastSeq: Math.max(conv.lastSeq, message.seq),
    lastReadSeq: read ? Math.max(conv.lastReadSeq, message.seq) : conv.lastReadSeq,
    unreadCount: read ? 0 : conv.unreadCount + 1,
  });
}

export function markRead(list: ConversationView[], conversationId: string, lastReadSeq: number): ConversationView[] {
  return list.map((c) =>
    c.id === conversationId
      ? { ...c, lastReadSeq: Math.max(c.lastReadSeq, lastReadSeq), unreadCount: Math.max(0, c.lastSeq - Math.max(c.lastReadSeq, lastReadSeq)) }
      : c,
  );
}

/** Titre affiché : celui du groupe, ou le nom de l'autre membre d'une conversation privée. */
export function titleOf(conversation: ConversationView, meId: string): string {
  if (conversation.title) return conversation.title;
  return conversation.members.find((m) => m.user.id !== meId)?.user.displayName ?? "Conversation";
}

export function roleOf(conversation: ConversationView, userId: string): MemberRole | undefined {
  return conversation.members.find((m) => m.user.id === userId)?.role;
}

export interface MemberActions {
  remove: boolean;
  promote: boolean;
  demote: boolean;
  leave: boolean;
}

/**
 * Actions proposées sur un membre, d'après les mêmes règles que l'API (#67, #92) : une action
 * interdite n'est pas affichée. L'API reste seule juge et revérifie chaque requête.
 */
export function memberActions(myRole: MemberRole | undefined, target: { role: MemberRole; isMe: boolean }): MemberActions {
  const none = { remove: false, promote: false, demote: false, leave: false };
  if (!myRole) return none;
  if (target.isMe) return { ...none, leave: true };
  return {
    remove: myRole === "owner" || (myRole === "admin" && target.role === "member"),
    promote: myRole === "owner" && target.role === "member",
    demote: myRole === "owner" && target.role === "admin",
    leave: false,
  };
}

export function canAddMembers(myRole: MemberRole | undefined): boolean {
  return myRole === "owner" || myRole === "admin";
}

/** Aperçu d'un message dans la liste : une ligne, préfixée par « Vous : » pour ses propres messages. */
export function previewOf(conversation: ConversationView, meId: string): string {
  const m = conversation.lastMessage;
  if (!m) return "Aucun message";
  const text = m.body.replace(/\s+/g, " ").trim();
  const short = text.length > 60 ? `${text.slice(0, 59)}…` : text;
  return m.senderId === meId ? `Vous : ${short}` : short;
}
