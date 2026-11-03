# MFA removal — 2026-11-03

The owner explicitly requested removal of MFA. Students, lecturers and administrators now sign in with email and password. Authenticator setup, recovery-code login and the production-admin MFA gate are removed. Registration email verification, password hashing, session revocation, rate limits and role/ownership checks remain.

Old MFA endpoints return 410 and cannot re-enable authenticator access or issue a session. Migration 031 deletes only retired MFA credentials, recovery codes and challenges; user accounts, passwords, sessions and academic data are preserved. Existing API compatibility fields report MFA disabled.

Local validation: 643 JavaScript/API checks passed (262 unit/component + 381 integration), including stale enabled-MFA rows, all roles, production admin access, invalid passwords, suspended accounts, retired endpoint behavior and migration data preservation. Nine targeted Chromium mobile/desktop and Firefox mobile browser checks passed: all three roles sign in without authenticator/recovery prompts, admin navigation remains available, and registration email OTP verification still works.

Application commit `f55bd67` is deployed at https://eduquest-dun.vercel.app. The real administrator signed in with email/password and opened the admin dashboard before legacy MFA records were cleared, confirming the requirement was removed from the application itself. Migration 031 then completed successfully. A live mobile browser subsequently verified administrator, lecturer and verified-student password-only login, correct role access, retired enrolment endpoints and logout. Database checks confirmed zero saved MFA credentials, recovery codes or login challenges remain.

Passwords were preserved, and obsolete MFA setup keys/recovery codes were removed from the private local account record. A private pre-migration backup remains excluded from Git/deployment. ESLint, type checking, formatting, build and credential scans passed.
