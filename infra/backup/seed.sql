-- Jeu de données synthétique pour le test de restauration (issue #9).
-- Reprend les tables principales de docs/architecture.md § 4, sans les migrations réelles
-- (apps/api n'existe pas encore). Variable psql : rows = nombre de messages (multiple de 100).
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  n int UNIQUE NOT NULL,
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  n int UNIQUE NOT NULL,
  type text NOT NULL CHECK (type IN ('private', 'group')),
  title text,
  last_seq bigint NOT NULL DEFAULT 0
);
CREATE TABLE conversation_members (
  conversation_id uuid REFERENCES conversations (id),
  user_id uuid REFERENCES users (id),
  role text NOT NULL DEFAULT 'member',
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations (id),
  sender_id uuid NOT NULL REFERENCES users (id),
  seq bigint NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq)
);
CREATE INDEX messages_conv_seq ON messages (conversation_id, seq DESC);

-- 1000 utilisateurs, 100 groupes de 10 membres (l'utilisateur n est membre du groupe n % 100).
INSERT INTO users (n, username, password_hash)
SELECT i, 'user' || i, 'argon2id-placeholder-' || i FROM generate_series(0, 999) AS i;

INSERT INTO conversations (n, type, title)
SELECT i, 'group', 'groupe ' || i FROM generate_series(0, 99) AS i;

INSERT INTO conversation_members (conversation_id, user_id)
SELECT c.id, u.id FROM conversations c JOIN users u ON u.n % 100 = c.n;

-- Message g : conversation g % 100, seq g / 100 + 1, envoyé par un des 10 membres.
INSERT INTO messages (conversation_id, sender_id, seq, body)
SELECT c.id, u.id, g / 100 + 1, 'message de test ' || g || ' ' || md5(g::text)
FROM generate_series(0, :rows - 1) AS g
JOIN conversations c ON c.n = g % 100
JOIN users u ON u.n = g % 100 + 100 * ((g / 100) % 10);

UPDATE conversations c SET last_seq = s.max_seq
FROM (SELECT conversation_id, max(seq) AS max_seq FROM messages GROUP BY conversation_id) s
WHERE s.conversation_id = c.id;
