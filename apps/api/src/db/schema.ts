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
  password_hash: string;
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

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  conversations: ConversationsTable;
  conversation_members: ConversationMembersTable;
  messages: MessagesTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type Session = Selectable<SessionsTable>;
export type Conversation = Selectable<ConversationsTable>;
export type ConversationMember = Selectable<ConversationMembersTable>;
export type Message = Selectable<MessagesTable>;
