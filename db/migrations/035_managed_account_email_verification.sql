-- New admin-provisioned accounts require OTP; preserve existing account access.
ALTER TABLE users ADD COLUMN requires_email_verification boolean NOT NULL DEFAULT false;
