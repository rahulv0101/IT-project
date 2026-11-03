# Collaboration, account management and mobile sweep — 2026-11-03

This change implements the requested admin account controls, student direct messages and group invitations, lecturer questions-and-answers review, Profile simplification, browser routing and installable mobile PWA.

Deletion removes access and personal account details while retaining academic history. Lecturer modules require reassignment. Messaging is private to the two students, and joining a private group requires membership or an accepted invitation. Profile no longer exposes email changes or MFA management; existing administrator sign-in protection remains in place.

The deterministic test stacks force development-file email and the mock AI provider. No test invokes the paid AI model or sends registration emails to arbitrary inboxes. Real PostgreSQL verification uses a disposable local database; production data is never reset or seeded.

Verified before deployment:

| Check                                                  | Result                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| JavaScript/component and PostgreSQL-protocol API tests | 636 passed, zero skipped (261 unit/component + 375 integration)                   |
| Real PostgreSQL, including simultaneous requests       | 378 passed, zero skipped                                                          |
| Python AI service                                      | 61 passed                                                                         |
| ESLint, TypeScript, Prettier, production build         | Passed                                                                            |
| Populated backup/restore and seed safety               | Passed; 29 migrations, 48 tables; messages and invitations included               |
| API authorization inventory                            | All 145 registered routes covered by concrete executable cases                    |
| iPhone WebKit and focused mobile feature checks        | Passed for admin CRUD, two-student messaging/invitations, lecturer review and PWA |

Production migration 029 was applied after saving a private backup of the previous 45-table database. No existing account or academic record was reset.

The complete browser matrix and production smoke-test evidence will be recorded below when those runs finish.
