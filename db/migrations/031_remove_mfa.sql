-- MFA is removed at the owner's request. Passwords, roles, email verification,
-- sessions and academic records are preserved; old MFA material is invalidated.
DELETE FROM mfa_login_challenges;
DELETE FROM mfa_recovery_codes;
DELETE FROM mfa_credentials;
