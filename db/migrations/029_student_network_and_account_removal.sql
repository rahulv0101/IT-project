ALTER TABLE users DROP CONSTRAINT users_account_status_check;
ALTER TABLE users ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('active','suspended','deleted'));

CREATE TABLE direct_conversations (
  conversation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_one uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  student_two uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (student_one < student_two),
  UNIQUE(student_one,student_two)
);
CREATE TABLE direct_messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES direct_conversations(conversation_id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  message_order bigint NOT NULL,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE(conversation_id,message_order)
);
CREATE INDEX direct_messages_conversation_time_idx ON direct_messages(conversation_id,created_at,message_id);
CREATE INDEX direct_messages_sender_time_idx ON direct_messages(sender_id,created_at);

CREATE TABLE group_invitations (
  invitation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES study_groups(group_id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  invitee_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (inviter_id <> invitee_id)
);
CREATE UNIQUE INDEX group_invitations_one_pending_idx ON group_invitations(group_id,invitee_id) WHERE status='pending';
CREATE INDEX group_invitations_inbox_idx ON group_invitations(invitee_id,status,created_at);
