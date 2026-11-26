import type { ColumnType, Generated, Insertable, Selectable } from "kysely";

/**
 * Types des tables, alignés sur la migration 0001 et sur docs/architecture.md § 4.
 * Les tables d'appels (calls, call_quality_samples) relèvent de la tranche Appels.
 */
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface UsersTable {
  id: Generated<string>;
  username: string;
  email: string;
  /** Absent pour un compte créé par la connexion Microsoft (migration 0003). */
  password_hash: string | null;
  display_name: string;
  created_at: Generated<Timestamp>;
}

export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  refresh_token_hash: string;
  family_id: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export type IdentityProvider = "microsoft";

/** Identité externe liée à un compte (ADR-0020). `subject` = `tid:oid` pour Microsoft. */
export interface UserIdentitiesTable {
  provider: IdentityProvider;
  subject: string;
  user_id: string;
  created_at: Generated<Timestamp>;
}

export type ConversationType = "private" | "group";
export type MemberRole = "owner" | "admin" | "member";

export interface ConversationsTable {
  id: Generated<string>;
  type: ConversationType;
  title: string | null;
  /** Paire d'identifiants triée « a:b », uniquement pour les conversations privées. */
  private_key: string | null;
  last_seq: Generated<number>;
  created_at: Generated<Timestamp>;
}

export interface ConversationMembersTable {
  conversation_id: string;
  user_id: string;
  role: Generated<MemberRole>;
  last_read_seq: Generated<number>;
  joined_at: Generated<Timestamp>;
}

export interface MessagesTable {
  id: Generated<string>;
  conversation_id: string;
  sender_id: string;
  seq: number;
  client_msg_id: string;
  body: string;
  created_at: Generated<Timestamp>;
}

export type CallMedia = "audio" | "video";
export type IceCandidateType = "host" | "srflx" | "relay";

export interface CallsTable {
  id: Generated<string>;
  conversation_id: string;
  media: CallMedia;
  initiator_id: string;
  started_at: Generated<Timestamp>;
  ended_at: Timestamp | null;
  end_reason: string | null;
}

export interface CallParticipantsTable {
  call_id: string;
  user_id: string;
  joined_at: Generated<Timestamp>;
  left_at: Timestamp | null;
}

export interface CallQualitySamplesTable {
  id: Generated<number>;
  call_id: string;
  user_id: string;
  ts: Timestamp;
  rtt_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
  bitrate_kbps: number;
  candidate_type: IceCandidateType;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  user_identities: UserIdentitiesTable;
  conversations: ConversationsTable;
  conversation_members: ConversationMembersTable;
  messages: MessagesTable;
  calls: CallsTable;
  call_participants: CallParticipantsTable;
  call_quality_samples: CallQualitySamplesTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type Session = Selectable<SessionsTable>;
export type Conversation = Selectable<ConversationsTable>;
export type ConversationMember = Selectable<ConversationMembersTable>;
export type Message = Selectable<MessagesTable>;
export type Call = Selectable<CallsTable>;
export type CallParticipant = Selectable<CallParticipantsTable>;
export type CallQualitySample = Selectable<CallQualitySamplesTable>;
