# MFA removal — 2026-11-03

The owner explicitly requested removal of MFA. Students, lecturers and administrators now sign in with email and password. Authenticator setup, recovery-code login and the production-admin MFA gate are removed. Registration email verification, password hashing, session revocation, rate limits and role/ownership checks remain.

Old MFA endpoints return 410 and cannot re-enable authenticator access or issue a session. Migration 031 deletes only retired MFA credentials, recovery codes and challenges; user accounts, passwords, sessions and academic data are preserved. Existing API compatibility fields report MFA disabled.

Local validation: 643 JavaScript/API checks passed (262 unit/component + 381 integration), including stale enabled-MFA rows, all roles, production admin access, invalid passwords, suspended accounts, retired endpoint behavior and migration data preservation. Browser and production verification are being finalized.
