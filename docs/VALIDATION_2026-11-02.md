# EduQuest system sweep — 2 November 2026

This report covers the local EduQuest application, its six solo games, academic
assessment boundaries, accounts, groups, sessions, messaging, labs and admin pages.
It separates repeatable offline checks from explicitly paid AI verification.

## Repairs

- Registration accepts a blank optional surname, presents field-specific errors,
  checks password confirmation and prevents repeated in-flight submissions.
- Email verification links have a working browser screen. MFA enrolment,
  confirmation, authenticator challenges and recovery-code actions are connected.
- Profile failures display an error rather than an endless spinner. Dirty-state
  tracking compares matching snapshots. At tablet widths the profile stacks into
  one column; language checkboxes cannot collapse to zero width.
- Leaderboard, analytics and quiz module selectors have accessible labels. Admin
  active tabs change colors without an intermediate contrast failure. Mobile
  welcome text retains spaces when line breaks collapse.
- Requests changing module/query paths discard stale data. AI cancel/retry errors
  are shown in the UI. Generation is disabled while a request/job is active;
  unsupported Office files are rejected before any generation job is queued.
- Missing or oversized upload titles return a bounded validation error and delete
  the temporary file rather than leaving the request hanging.
- ESLint now enforces JavaScript and React rules. Python execution consistently
  selects a project environment or Python 3.11+. Launchers use checkout-relative
  paths, environment defaults preserve provider settings, and example secrets
  are replaced safely without rotating an existing usable MFA encryption key.
- Browser startup waits for the database and cleans up failed child processes.
  JavaScript test runs allocate independent database ports. Test fixtures avoid
  relying on profile preferences left by earlier viewport projects.
- On macOS, Firefox receives isolated temporary app data as well as its temporary
  browser profile. This resolves the
  [Playwright/macOS profile-launch issue](https://github.com/microsoft/playwright/issues/42768)
  without requesting access to or modifying the user's real Firefox profile.
- JSON backup reads one consistent transaction snapshot. Restore validates schema
  metadata, orders parent rows first, maps values by column, handles JSON types,
  validates deferred foreign keys and restores trigger states transactionally.
  Populated round-trip and rollback checks replace the old empty-database test.

## Verification

| Check                                    | Result                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint                                   | Passed with actual JavaScript/React rules                                                                                              |
| Prettier                                 | Passed                                                                                                                                 |
| Project type-check                       | Passed (backend/scripts scope)                                                                                                         |
| Frontend production build                | Passed                                                                                                                                 |
| JavaScript unit/component tests          | 231 passed, zero skipped                                                                                                               |
| PGlite database/API tests                | 335 passed, zero skipped                                                                                                               |
| Python offline suite                     | 59 passed, zero skipped                                                                                                                |
| Chromium/Firefox browser matrix          | 162 passed: 81 Chromium and 81 Firefox at 390, 768 and 1280 pixels; zero skipped                                                       |
| PostgreSQL 16.15 database/API tests      | 338 passed, zero skipped, 20 files                                                                                                     |
| Concurrent PostgreSQL checks             | Eight simultaneous starts create one attempt; eight submissions score once; conflicting correct-option writes allow one winner         |
| PGlite populated JSON backup/restore     | 44 tables preserved; invalid reference rolls back; reordered columns restore correctly                                                 |
| PostgreSQL populated JSON backup/restore | 44 tables preserved, including academic/game fixtures                                                                                  |
| Native PostgreSQL dump/restore           | All 4,776 rows across 44 tables identical in a separate restored database                                                              |
| Seed safety                              | Repeated seed preserves 2 demo quizzes, 65 questions, 3 attempts and an existing game play; cancelled/production reset is refused      |
| Real OpenRouter pipeline                 | Eight Haiku 5.5 questions from an uploaded PDF persisted, published and submitted by a student with the expected score; 29.247 seconds |

The browser total combines the 81 passing Chromium cases with the final 81-case
Firefox rerun after the macOS launch/handoff repair. No assertions were disabled.

The PostgreSQL run used an isolated `postgres:16-alpine` container in a temporary
Colima profile. The existing Docker context remained `default`. The test
container/profile are removed after validation. Normal database tests and browser
checks use isolated PGlite directories and never reset development data.

The live AI check is now reproducible with `npm run test:ai:real`; it is an
explicit paid integration check, not an offline mock test. The browser suite
uses MockProvider deliberately so its results are repeatable and incur no model
charges. The local OpenRouter key remains only in the Git-ignored `.env`.

## Evidence and practical limits

The added `frontend/e2e/system-sweep.spec.js` covers registration validation,
optional surname, duplicate account errors, session refresh, email verification,
MFA setup/recovery/disable and every navigation destination for all three roles.
It also visits all admin tabs and checks axe violations, browser crashes and
horizontal overflow. Screenshots are written beneath `test-results/`.

Reviewed screenshots: [registration on mobile](report/system-sweep/registration-mobile.png)
and [the repaired tablet profile](report/system-sweep/profile-tablet.png).

Runtime: macOS, Node 24.7.0, project Python 3.12 environment. The installed jsdom
package declares a newer supported Node patch range; the checks here record the
actual installed runtime rather than claiming support across Node releases.
Windows launchers were inspected and their portable entrypoint tested; native
Windows execution was not available on this Mac. The React files are not included
in the repository's TypeScript configuration; build/component/browser checks
cover them instead. Several runtime-shaped backend files also opt out of static
checking.

Email delivery still uses local development mail files under `docs/dev-mail`;
SMTP delivery is not configured or verified. Large documents are sampled before
AI generation, and quiz correctness/coverage still needs lecturer review. The
live check used a small purpose-built PDF. Mini-scope/analysis remain template
implementations and multiplayer remains unimplemented. This sweep does not
certify production deployment, load capacity, manual screen-reader behavior or
full coverage of arbitrary uploaded documents.
