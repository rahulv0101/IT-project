-- Deactivation preserves the account and all linked data while denying access.
ALTER TABLE users DROP CONSTRAINT users_account_status_check;
ALTER TABLE users ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('active','suspended','inactive','deleted'));
