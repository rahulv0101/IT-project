CREATE TABLE email_verification_codes (
  user_id uuid PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL,
  code_hash text NOT NULL,
  target_email text,
  expires_at timestamptz NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
