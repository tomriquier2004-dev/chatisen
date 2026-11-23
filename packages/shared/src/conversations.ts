import { Type, type Static } from "@sinclair/typebox";
import { PublicUser } from "./auth";
import { Uuid } from "./ids";
import { Message } from "./messages";

export const ConversationType = Type.Union([Type.Literal("private"), Type.Literal("group")]);
export type ConversationType = Static<typeof ConversationType>;

/** Rôles d'un membre de groupe (FR-16). Dans une conversation privée, les deux membres sont « member ». */
export const MemberRole = Type.Union([Type.Literal("owner"), Type.Literal("admin"), Type.Literal("member")]);
export type MemberRole = Static<typeof MemberRole>;

export const GroupTitle = Type.String({ minLength: 1, maxLength: 64 });

/** Taille maximale d'un groupe, créateur compris. */
export const MAX_GROUP_MEMBERS = 50;

export const ConversationMember = Type.Object(
  { user: PublicUser, role: MemberRole },
  { additionalProperties: false },
);
export type ConversationMember = Static<typeof ConversationMember>;

/** Une conversation vue par l'un de ses membres (liste et détail, architecture § 5.1). */
export const ConversationView = Type.Object(
  {
    id: Uuid,
    type: ConversationType,
    /** Titre du groupe ; null pour une conversation privée (le client affiche l'autre membre). */
    title: Type.Union([Type.String(), Type.Null()]),
    members: Type.Array(ConversationMember),
    /** seq du dernier message de la conversation (0 si aucun). */
    lastSeq: Type.Integer({ minimum: 0 }),
    /** Dernier seq lu par l'utilisateur courant. */
    lastReadSeq: Type.Integer({ minimum: 0 }),
    unreadCount: Type.Integer({ minimum: 0 }),
    /** Dernier message, pour l'aperçu de la liste (null si aucun). */
    lastMessage: Type.Union([Message, Type.Null()]),
    createdAt: Type.String(),
  },
  { additionalProperties: false, $id: "ConversationView" },
);
export type ConversationView = Static<typeof ConversationView>;

export const ConversationList = Type.Array(ConversationView);
export type ConversationList = Static<typeof ConversationList>;

/** POST /api/v1/conversations : conversation privée (avec un autre utilisateur) ou groupe. */
export const CreateConversationRequest = Type.Union([
  Type.Object({ type: Type.Literal("private"), userId: Uuid }, { additionalProperties: false }),
  Type.Object(
    {
      type: Type.Literal("group"),
      title: GroupTitle,
      memberIds: Type.Array(Uuid, { maxItems: MAX_GROUP_MEMBERS - 1, uniqueItems: true }),
    },
    { additionalProperties: false },
  ),
]);
export type CreateConversationRequest = Static<typeof CreateConversationRequest>;

/** POST /api/v1/conversations/:id/members */
export const AddMemberRequest = Type.Object(
  {
    userId: Uuid,
    /** « admin » réservé au propriétaire ; « member » par défaut. */
    role: Type.Optional(Type.Union([Type.Literal("admin"), Type.Literal("member")])),
  },
  { additionalProperties: false },
);
export type AddMemberRequest = Static<typeof AddMemberRequest>;

export const ConversationParams = Type.Object({ id: Uuid }, { additionalProperties: false });
export type ConversationParams = Static<typeof ConversationParams>;

export const MemberParams = Type.Object({ id: Uuid, userId: Uuid }, { additionalProperties: false });
export type MemberParams = Static<typeof MemberParams>;

/** PATCH /api/v1/conversations/:id/members/:userId : changement de rôle, réservé au propriétaire (FR-16). */
export const ChangeRoleRequest = Type.Object(
  { role: Type.Union([Type.Literal("admin"), Type.Literal("member")]) },
  { additionalProperties: false },
);
export type ChangeRoleRequest = Static<typeof ChangeRoleRequest>;

/** GET /api/v1/users?query= : recherche par nom d'utilisateur ou nom affiché (FR-02). */
export const UserSearchQuery = Type.Object(
  { query: Type.String({ minLength: 2, maxLength: 64 }) },
  { additionalProperties: false },
);
export type UserSearchQuery = Static<typeof UserSearchQuery>;

export const UserSearchResponse = Type.Array(PublicUser, { maxItems: 20 });
export type UserSearchResponse = Static<typeof UserSearchResponse>;
