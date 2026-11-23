import { describe, expect, it } from "vitest";
import type { Message } from "@chatisen/shared";
import { addPending, firstSeqOf, lastSeqOf, markFailed, mergeMessages, type ChatItem } from "./chatState";

const ALICE = "11111111-1111-4111-8111-111111111111";
const msg = (seq: number, clientMsgId = `c${seq}`): Message => ({
  id: `id${seq}`,
  conversationId: "conv",
  senderId: ALICE,
  seq,
  clientMsgId,
  body: `m${seq}`,
  createdAt: new Date(0).toISOString(),
});
const seqs = (items: ChatItem[]) => items.map((i) => (i.status === "sent" ? i.message.seq : i.status));

describe("mergeMessages", () => {
  it("trie par seq serveur, quel que soit l'ordre d'arrivée", () => {
    expect(seqs(mergeMessages([], [msg(3), msg(1), msg(2)]))).toEqual([1, 2, 3]);
  });

  it("ne duplique jamais un message reçu deux fois (ack + message:new + rattrapage)", () => {
    let items = mergeMessages([], [msg(1)]);
    items = mergeMessages(items, [msg(1), msg(2)]);
    items = mergeMessages(items, [msg(2)]);
    expect(seqs(items)).toEqual([1, 2]);
  });

  it("remplace le message en attente par sa version confirmée", () => {
    let items = addPending(mergeMessages([], [msg(1)]), "c2", "m2", ALICE);
    expect(seqs(items)).toEqual([1, "pending"]);
    items = mergeMessages(items, [msg(2, "c2")]);
    expect(seqs(items)).toEqual([1, 2]);
  });

  it("garde les messages non confirmés à la fin, après l'historique plus ancien chargé ensuite", () => {
    let items = addPending(mergeMessages([], [msg(10)]), "new", "x", ALICE);
    items = mergeMessages(items, [msg(8), msg(9)]);
    expect(seqs(items)).toEqual([8, 9, 10, "pending"]);
    expect(firstSeqOf(items)).toBe(8);
    expect(lastSeqOf(items)).toBe(10);
  });
});

describe("échec puis renvoi", () => {
  it("repasse un message en échec en attente, avec le même clientMsgId", () => {
    let items = addPending([], "c1", "salut", ALICE);
    items = markFailed(items, "c1", "Impossible de joindre le serveur.");
    expect(items[0]).toMatchObject({ status: "failed", clientMsgId: "c1" });
    items = addPending(items, "c1", "salut", ALICE);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "pending", clientMsgId: "c1" });
  });
});
