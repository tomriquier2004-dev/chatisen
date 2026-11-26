import { Type, type Static } from "@sinclair/typebox";
import type { ErrorResponse } from "./errors";
import { Uuid } from "./ids";
import type { CallClientToServerEvents, CallServerToClientEvents } from "./calls";

/** Corps d'un message : 1 à 4 000 caractères (même borne que la contrainte en base). */
export const MessageBody = Type.String({ minLength: 1, maxLength: 4000 });

/** Un message stocké (architecture § 4, FR-07). L'ordre fait foi par `seq`, jamais par l'horloge du client. */
export const Message = Type.Object(
  {
    id: Uuid,
    conversationId: Uuid,
    senderId: Uuid,
    seq: Type.Integer({ minimum: 1 }),
    clientMsgId: Uuid,
    body: Type.String(),
    createdAt: Type.String(),
  },
  { additionalProperties: false, $id: "Message" },
);
export type Message = Static<typeof Message>;

/** GET /api/v1/conversations/:id/messages?before=<seq>&limit= : page d'historique (FR-08). */
export const MessageHistoryQuery = Type.Object(
  {
    /** Messages de seq strictement inférieur ; absent = les plus récents. */
    before: Type.Optional(Type.Integer({ minimum: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
  },
  { additionalProperties: false },
);
export type MessageHistoryQuery = Static<typeof MessageHistoryQuery>;

/** Page d'historique, triée par seq croissant (prête à afficher). */
export const MessageHistory = Type.Array(Message);
export type MessageHistory = Static<typeof MessageHistory>;

/** message:send (client → serveur), architecture § 5.2. */
export const MessageSendPayload = Type.Object(
  { conversationId: Uuid, clientMsgId: Uuid, body: MessageBody },
  { additionalProperties: false },
);
export type MessageSendPayload = Static<typeof MessageSendPayload>;

/** conversation:sync (client → serveur) : messages manqués après une coupure (FR-17). */
export const ConversationSyncPayload = Type.Object(
  { conversationId: Uuid, afterSeq: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);
export type ConversationSyncPayload = Static<typeof ConversationSyncPayload>;

/** Nombre maximal de messages renvoyés par un conversation:sync ; au-delà, le client pagine par REST. */
export const SYNC_LIMIT = 200;

/** message:read (client → serveur) : l'utilisateur a lu jusqu'à `seq` ; ack avec le nouveau lastReadSeq. */
export const MessageReadPayload = Type.Object(
  { conversationId: Uuid, seq: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);
export type MessageReadPayload = Static<typeof MessageReadPayload>;

/** Réponse (ack) d'un événement client → serveur : un résultat, ou une erreur au format unique. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: ErrorResponse["error"] };

/** conversation:member-added (serveur → client) : reçu par le membre ajouté et par les autres membres (§ 5.3). */
export const MemberAddedEvent = Type.Object(
  {
    conversationId: Uuid,
    userId: Uuid,
    role: Type.Union([Type.Literal("owner"), Type.Literal("admin"), Type.Literal("member")]),
    by: Uuid,
  },
  { additionalProperties: false },
);
export type MemberAddedEvent = Static<typeof MemberAddedEvent>;

/** conversation:member-removed (serveur → client) : reçu par le membre retiré et par les membres restants (§ 5.3). */
export const MemberRemovedEvent = Type.Object(
  {
    conversationId: Uuid,
    userId: Uuid,
    by: Uuid,
    reason: Type.Union([Type.Literal("removed"), Type.Literal("left"), Type.Literal("deleted")]),
  },
  { additionalProperties: false },
);
export type MemberRemovedEvent = Static<typeof MemberRemovedEvent>;

/** conversation:member-updated (serveur → client) : rôle d'un membre changé (FR-16). */
export const MemberUpdatedEvent = Type.Object(
  {
    conversationId: Uuid,
    userId: Uuid,
    role: Type.Union([Type.Literal("owner"), Type.Literal("admin"), Type.Literal("member")]),
    by: Uuid,
  },
  { additionalProperties: false },
);
export type MemberUpdatedEvent = Static<typeof MemberUpdatedEvent>;

/** Événements émis par le serveur (architecture § 5.2). */
export interface ServerToClientEvents extends CallServerToClientEvents {
  "message:new": (message: Message) => void;
  "conversation:member-added": (event: MemberAddedEvent) => void;
  "conversation:member-removed": (event: MemberRemovedEvent) => void;
  "conversation:member-updated": (event: MemberUpdatedEvent) => void;
}

/** Événements émis par le client, avec leur ack. */
export interface ClientToServerEvents extends CallClientToServerEvents {
  "message:send": (payload: MessageSendPayload, ack: (res: Ack<Message>) => void) => void;
  "conversation:sync": (payload: ConversationSyncPayload, ack: (res: Ack<Message[]>) => void) => void;
  "message:read": (payload: MessageReadPayload, ack: (res: Ack<{ lastReadSeq: number }>) => void) => void;
}
