import { describe, expect, it } from "vitest";
import type { ConversationView, Message } from "@chatisen/shared";
import { applyMessage, markRead, memberActions, previewOf, sortByActivity, titleOf } from "./model";

const ME = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

const conv = (id: string, createdAt: string, extra: Partial<ConversationView> = {}): ConversationView => ({
  id,
  type: "group",
  title: id,
  members: [
    { user: { id: ME, username: "me", displayName: "Moi" }, role: "owner" },
    { user: { id: BOB, username: "bob", displayName: "Bob" }, role: "member" },
  ],
  lastSeq: 0,
  lastReadSeq: 0,
  unreadCount: 0,
  lastMessage: null,
  createdAt,
  ...extra,
});
const msg = (conversationId: string, seq: number, senderId: string, createdAt: string): Message => ({
  id: `${conversationId}-${seq}`,
  conversationId,
  senderId,
  seq,
  clientMsgId: `${conversationId}-c${seq}`,
  body: `m${seq}`,
  createdAt,
});

describe("liste des conversations", () => {
  const list = sortByActivity([conv("a", "2026-01-01T00:00:00Z"), conv("b", "2026-01-02T00:00:00Z")]);

  it("trie par activité", () => {
    expect(list.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("un message reçu remonte la conversation et incrémente les non-lus", () => {
    const next = applyMessage(list, msg("a", 1, BOB, "2026-01-03T00:00:00Z"), ME, null);
    expect(next.map((c) => c.id)).toEqual(["a", "b"]);
    expect(next[0]).toMatchObject({ unreadCount: 1, lastSeq: 1, lastMessage: { body: "m1" } });
  });

  it("pas de non-lu pour son propre message ni pour la conversation ouverte", () => {
    expect(applyMessage(list, msg("a", 1, ME, "2026-01-03T00:00:00Z"), ME, null)[0]?.unreadCount).toBe(0);
    expect(applyMessage(list, msg("a", 1, BOB, "2026-01-03T00:00:00Z"), ME, "a")[0]?.unreadCount).toBe(0);
  });

  it("ignore un message déjà connu (rattrapage, doublon)", () => {
    const once = applyMessage(list, msg("a", 1, BOB, "2026-01-03T00:00:00Z"), ME, null);
    expect(applyMessage(once, msg("a", 1, BOB, "2026-01-03T00:00:00Z"), ME, null)).toBe(once);
  });

  it("l'accusé de lecture remet les non-lus à zéro", () => {
    const unread = applyMessage(list, msg("a", 1, BOB, "2026-01-03T00:00:00Z"), ME, null);
    expect(markRead(unread, "a", 1).find((c) => c.id === "a")?.unreadCount).toBe(0);
  });

  it("affiche l'autre membre comme titre d'une conversation privée, et un aperçu court", () => {
    const priv = conv("p", "2026-01-01T00:00:00Z", { type: "private", title: null, lastMessage: msg("p", 1, ME, "x") });
    expect(titleOf(priv, ME)).toBe("Bob");
    expect(previewOf(priv, ME)).toBe("Vous : m1");
    expect(previewOf(conv("q", "x"), ME)).toBe("Aucun message");
  });
});

describe("actions proposées selon le rôle", () => {
  it("le propriétaire retire, promeut et rétrograde ; il ne peut que quitter pour lui-même", () => {
    expect(memberActions("owner", { role: "member", isMe: false })).toEqual({ remove: true, promote: true, demote: false, leave: false });
    expect(memberActions("owner", { role: "admin", isMe: false })).toEqual({ remove: true, promote: false, demote: true, leave: false });
    expect(memberActions("owner", { role: "owner", isMe: true })).toEqual({ remove: false, promote: false, demote: false, leave: true });
  });

  it("un admin ne retire que des membres simples et ne change pas les rôles", () => {
    expect(memberActions("admin", { role: "member", isMe: false })).toMatchObject({ remove: true, promote: false });
    expect(memberActions("admin", { role: "admin", isMe: false })).toMatchObject({ remove: false, demote: false });
    expect(memberActions("admin", { role: "owner", isMe: false }).remove).toBe(false);
  });

  it("un membre simple ne voit aucune action sur les autres", () => {
    expect(memberActions("member", { role: "member", isMe: false })).toEqual({ remove: false, promote: false, demote: false, leave: false });
  });
});
