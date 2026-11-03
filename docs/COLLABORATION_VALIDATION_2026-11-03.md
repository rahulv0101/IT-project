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

Browser validation covered 197 distinct scenarios across Chromium and Firefox at 390, 768 and 1280 pixels, plus focused iPhone WebKit checks. The broad 190-case matrix passed 187 cases and identified three Firefox offline-emulator assumptions. After correcting those checks and adding seven actual-origin outage cases, the final 20-case run passed completely: seven PWA metadata/cache checks, seven real outage/reconnection checks and six session notification/back/forward checks. No browser cases were skipped and no failures remain unresolved.

The real-outage check shuts down its own origin, verifies the cached public offline page, restarts the origin and verifies reconnection. This supplements Firefox's offline emulator, which empirically leaves service-worker fetches online. All `/api/v1` HTTP responses explicitly carry `private, no-store`; private responses and mutations never enter the service-worker cache.

The final production deployment uses application commit `e4354d8`. HTTPS checks confirmed `/health` returns 200, `/sw.js` serves the updated no-cache worker, and unauthenticated API responses return 401 with `Cache-Control: private, no-store`. The client bundle and every committed change passed credential scanning. The final report/test synchronization commit changes no deployed application code.

Published code is available at https://eduquest-dun.vercel.app. Browser checks emulate screen sizes and iPhone WebKit; physical phone installation has not been exercised.

Reproduction commands: `npm test`, `npm run test:python`, `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, `npm run test:backup` and `npm run test:e2e`. Real PostgreSQL verification requires a disposable `REAL_TEST_DATABASE_URL`; production must never be reset or seeded. The final focused browser command was `npm run test:e2e -- --grep 'PWA serves|PWA survives|study sessions:'` (20/20 passed).
