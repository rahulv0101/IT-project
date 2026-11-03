# Collaboration, account management and mobile sweep — 2026-11-03

This change implements the requested admin account controls, student direct messages and group invitations, lecturer questions-and-answers review, Profile simplification, browser routing and installable mobile PWA.

Deletion removes access and personal account details while retaining academic history. Lecturer modules require reassignment. Messaging is private to the two students, and joining a private group requires membership or an accepted invitation. Profile no longer exposes email changes or MFA management; existing administrator sign-in protection remains in place.

The deterministic test stacks force development-file email and the mock AI provider. No test invokes the paid AI model or sends registration emails to arbitrary inboxes. Real PostgreSQL verification uses a disposable local database; production data is never reset or seeded.

Verified before deployment:

| Check                                                  | Result                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| JavaScript/component and PostgreSQL-protocol API tests | 637 passed, zero skipped (261 unit/component + 376 integration)                   |
| Real PostgreSQL, including simultaneous requests       | 378 passed, zero skipped                                                          |
| Python AI service                                      | 61 passed                                                                         |
| ESLint, TypeScript, Prettier, production build         | Passed                                                                            |
| Populated backup/restore and seed safety               | Passed; 29 migrations, 48 tables; messages and invitations included               |
| API authorization inventory                            | All 145 registered routes covered by concrete executable cases                    |
| iPhone WebKit and focused mobile feature checks        | Passed for admin CRUD, two-student messaging/invitations, lecturer review and PWA |

Production migration 029 was applied after saving a private backup of the previous 45-table database. No existing account or academic record was reset.

Production functional checks passed for creating all three roles, exchanging private student messages, role boundaries, invitation acceptance, roster access, leadership handover and leaving, AI/manual questions-and-answers review, Profile controls and the HTTPS PWA. Four disposable accounts were removed through the new deletion API; they disappeared from Users and deleted-account login returned 401. Owner accounts and existing academic records were retained.

A read-only production sweep passed 24 pages/administration sections across lecturer, verified student and administrator accounts, including axe accessibility, mobile overflow and the absence of Profile email/MFA controls. Private before/after migration backups contain 45 and 48 tables respectively and are excluded from Git/deployment.

The browser matrix is finishing. Its real-outage PWA check shuts down a dedicated test origin rather than relying solely on Firefox's offline emulator, which empirically leaves service-worker fetches online. API HTTP responses are explicitly private/no-store and never enter the service-worker cache.

Published code is available at https://eduquest-dun.vercel.app. Browser checks emulate screen sizes and iPhone WebKit; physical phone installation has not been exercised.
