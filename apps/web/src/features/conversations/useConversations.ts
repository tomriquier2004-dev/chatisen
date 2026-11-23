import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { ConversationList, ConversationView } from "@chatisen/shared";
import { api, realtime } from "../../app/services";
import { ApiError } from "../../lib/errors";
import { applyMessage, markRead, reconcile, remove, sortByActivity, titleOf, upsert } from "./model";

export interface ConversationsState {
  conversations: ConversationView[];
  error: string | null;
  /** Message à afficher quand la conversation ouverte disparaît (retrait, suppression). */
  notice: string | null;
  selectedId: string | null;
  select(id: string | null): void;
  /** Ajoute ou rafraîchit une conversation (après création, ajout de membre…). */
  put(view: ConversationView): void;
  dismissNotice(): void;
  read(conversationId: string, seq: number): void;
}

/**
 * Liste des conversations tenue à jour en direct (issue #79) :
 * nouveaux messages (aperçu, tri, non-lus), ajout et retrait de membres, changements de rôle.
 * Une conversation dont on est retiré disparaît et sa vue se ferme, sans rechargement.
 */
export function useConversations(meId: string): ConversationsState {
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;
  const listRef = useRef<ConversationView[]>([]);
  listRef.current = conversations;

  const refresh = useCallback(async (conversationId: string) => {
    try {
      const view = await api.request("GET", `/conversations/${conversationId}`, ConversationView);
      setConversations((list) => upsert(list, view));
    } catch (err) {
      // Plus membre entre-temps : la conversation disparaît.
      if (err instanceof ApiError && (err.code === "CONVERSATION_FORBIDDEN" || err.code === "NOT_FOUND")) {
        setConversations((list) => remove(list, conversationId));
      }
    }
  }, []);

  useEffect(() => {
    api
      .request("GET", "/conversations", ConversationList)
      .then((list) => {
        setConversations(sortByActivity(list));
        setSelectedId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Chargement impossible."));
  }, []);

  // Après une coupure, la liste est rechargée depuis le serveur (issue #98) : aperçus, non-lus,
  // conversations créées ou quittées pendant la coupure. La conversation ouverte se ferme si
  // l'on n'en est plus membre.
  useEffect(
    () =>
      realtime.onResume(() => {
        api
          .request("GET", "/conversations", ConversationList)
          .then((list) => {
            const fresh = reconcile(listRef.current, list, selectedRef.current);
            setConversations(fresh.list);
            if (fresh.lostSelected) {
              setSelectedId(null);
              setNotice(`Vous avez été retiré de « ${titleOf(fresh.lostSelected, meId)} ».`);
            }
          })
          .catch(() => undefined);
      }),
    [meId],
  );

  useEffect(() => {
    const offMessage = realtime.onMessage((m) =>
      setConversations((list) => applyMessage(list, m, meId, selectedRef.current)),
    );
    const socket = realtime.socket;
    const onAdded = (e: { conversationId: string }) => void refresh(e.conversationId);
    const onUpdated = (e: { conversationId: string }) => void refresh(e.conversationId);
    const onRemoved = (e: { conversationId: string; userId: string; reason: string }) => {
      if (e.userId !== meId) return void refresh(e.conversationId);
      const gone = listRef.current.find((c) => c.id === e.conversationId);
      setConversations((list) => remove(list, e.conversationId));
      if (selectedRef.current === e.conversationId) {
        setSelectedId(null);
        if (gone && e.reason === "removed") setNotice(`Vous avez été retiré de « ${titleOf(gone, meId)} ».`);
      }
    };
    socket.on("conversation:member-added", onAdded);
    socket.on("conversation:member-updated", onUpdated);
    socket.on("conversation:member-removed", onRemoved);
    return () => {
      offMessage();
      socket.off("conversation:member-added", onAdded);
      socket.off("conversation:member-updated", onUpdated);
      socket.off("conversation:member-removed", onRemoved);
    };
  }, [meId, refresh]);

  return {
    conversations,
    error,
    notice,
    selectedId,
    select: (id) => {
      setNotice(null);
      setSelectedId(id);
    },
    put: (view) => setConversations((list) => upsert(list, view)),
    dismissNotice: () => setNotice(null),
    read: (conversationId, seq) => {
      setConversations((list) => markRead(list, conversationId, seq));
      void realtime.markRead(conversationId, seq);
    },
  };
}
