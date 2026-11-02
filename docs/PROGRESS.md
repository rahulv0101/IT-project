# EduQuest progress

## Study group sessions and calendar — 2026-11-02

- Added migration 025 with group sessions, preparation-resource scope, RSVPs, notifications, and a session reference for existing group updates while preserving existing data.
- Added membership- and leader-scoped session lifecycle APIs: create/edit/cancel/duplicate/weekly recurrence, clash warnings, RSVP privacy, escaped iCalendar downloads, notifications, and idempotent 24-hour/one-hour reminder processing.
- Added the dashboard next-three card, group-card next session, accessible list/month/week calendar, read-only lecturer calendar view, notifications bell, and session detail/resource actions.
- Stabilised the isolated PGlite browser stack with an e2e-only data directory, distinct ports, readiness checks, and a one-connection pool limit; browser tests cannot use the development database.
- Gate: unit/backend/frontend 204/204, DB/API 286/286, Python 43/43, and full Chromium/Firefox browser and axe matrix 132/132. Zero skipped checks and zero axe violations. Lint, formatting, type-check, and production build passed.

## Study group messaging — 2026-11-02

- Added migration 026 for messages, attachments, reads, mutes, reports, and message notifications while preserving session notifications.
- Added scoped message/reply/report/mute/read/attachment routes with strict schemas, profanity checks, rate limits, membership authorization, leader moderation, and no reporter identity disclosure.
- Added a responsive chat tab with escaped rendering, safe HTTPS links, ETag/cursor polling, visibility pause, and lecturer read-only mode.
- Focused evidence: 9/9 messaging API tests, 4/4 chat component tests, and 122/122 authorization-matrix cases. Final gates: unit/frontend 207/207, DB/API 306/306, Python 43/43, all zero skipped. The focused browser flow passed 5/6 projects; Firefox desktop exposed the existing e2e Vite child exit (Windows code 3221226505), so the complete browser matrix remains not green.

## Browser stability hardening — 2026-11-02

- E2E now builds the frontend once and serves the production bundle with `vite preview` on the isolated loopback port; the Vite development server and HMR/file watcher are not used by browser tests.
- Group-chat polling now guards in-flight updates after unmount, pauses while hidden, cleans up its timer/listener, and backs off after repeated errors. Component coverage includes unmount, hidden-tab pause and error backoff.
- Diagnosis: the original failure was the Vite dev child exiting on Windows with `3221226505` under the long matrix; after the static-preview change, the focused six-project flow passed 6/6 including Firefox desktop. A later full-matrix run had separate intermittent pre-existing login/axe failures after long sequential execution; those tests were not weakened or excluded.
- Deterministic gates after the fix: unit/frontend 210/210, DB/API 306/306, Python 43/43, all with zero skips; production build, lint, format and type-check passed.

## FR-28 — Island Escape solo — 2026-10-27

- Built the pure deterministic three-phase engine, centralized configuration, strict versioned state schema, difficulty-ramped question selection, setback/recycling rules, personal-best tracking, and replayable append-only moves.
- Added migration 008 with the enabled catalog type, Island move references, option/question scope FK, per-attempt no-repeat index, personal best table, and state/score/terminal triggers.
- Added strict start/resume, owner refresh, and row-locked idempotent answer APIs under `/api/v1/games/island-escape`, using the shared `canAccessGame` policy and pre-answer correctness boundary.
- Built the responsive accessible Island screen with original SVG art, phase/inventory/boat/sailing states, textual wrong/streak/retry/score indicators, feedback, setback, terminal, replay, loading, empty, and error states.
- Updated the seed to 40 questions across five topics and levels so Island Escape is playable after `npm run seed`.
- Gate: 177 JavaScript tests, 4 Python tests, and 24 Chromium/Firefox browser tests passed with zero skips. Lint, formatting, type-check, and production frontend build passed. FR-28 solo is done and tested; game output remains isolated from scored attempts, rankings, and analytics.

## FR-23–FR-27 Stage 0 — Shared game foundation — 2026-10-27

- Replaced three-value question difficulty storage with checked levels 1–5 and one shared Easy/Medium/Hard tier mapper. Infected behavior remains unchanged through that mapper.
- Added versioned generic `game_plays` state, append-only `game_play_moves`, active-play uniqueness, terminal guards, module-scope enforcement, per-game Zod state registration, and aggregate-only lecturer progress.
- Removed superseded catalog placeholders and added Memory Match, Timer Trivia, Boss Battle, and Pixel Car Racer as disabled rows. No new game mechanics are enabled yet.
- Updated AI contracts, worker validation, lecturer draft editing, seed data, authorization inventory, ERD, invariants, status, and traceability.
- Gate: 141 JavaScript tests, 4 Python tests, and 18 Chromium/Firefox browser tests passed with zero skips. Lint, formatting, type-check, and production frontend build passed. The dev migration and seed completed; the demo competitive quiz has 25 questions across five topics and all five levels.

## FR-22 Stage 1 — Infected solo — 2026-10-27

- Built the deterministic practice-only engine, persisted solo sessions/turns/cards, transactional and idempotent API, access checks, aggregate lecturer activity, AI difficulty/explanation contract, editable lecturer draft fields, seeded playable quiz, and responsive accessible UI.
- Enforced INV-16 through INV-22 in database constraints/triggers, service serialization, and isolated game persistence. Infected scores never enter attempts, leaderboards, or analytics.
- Verification: 131 JavaScript tests, 4 AI-service tests, and 18 Playwright/axe tests passed; 0 skipped. Lint, formatting, type-check, and production frontend build passed.
- Browser evidence covers Chromium and Firefox at 390, 768, and 1280 pixels. PGlite still cannot establish real multi-connection row-lock behavior; that remains assigned to `npm run test:db:real`.
- Group mode is deliberately not started. Stage 2 rules require approval at the Stage 1 gate.

## Local run verification — 2026-10-09

Fixed Vite API forwarding, strict login payloads, development cookie configuration,
AI worker startup, student quiz navigation, accessible navigation names, mobile
navigation labels, and document language/title/viewport metadata. Database startup
now preserves existing .env settings and removes stale PID files only when the
recorded process no longer exists. Recovered the local daemons without deleting data.

Verified 89 JavaScript tests and 4 Python tests with no skips. Added a real browser
smoke test for lecturer login, session persistence after reload, generated draft,
publishing and logout. It requires the seeded demo accounts and running local stack.
The authentication axe test covers only the login screen, not the whole product.
Final browser results: 6 Chromium tests passed and 6 Firefox tests passed, zero skips,
covering widths 390, 768 and 1280. Lint, formatting, type-check and frontend build pass.

The earlier authorization completion claim was overstated; STATUS and TRACEABILITY
now identify the missing strict validation and cross-owner evidence. Native
PostgreSQL concurrency/backup and complete screen accessibility remain outstanding.

## Milestone 1 — Foundation

- Built PostgreSQL-compatible PGlite dev/test socket servers, persistent `.pgdata`, environment generation, setup checks, migrations, schema triggers, indexes, seed tooling, and raw SQL invariant tests.
- PGlite does not provide `citext`; the approved lowercased-email/`lower(email)` unique-index fallback is active.
- Tests: 7 database invariant tests and 25 profanity tests passed; 0 skipped.

## Milestone 2 — Auth/RBAC

- Built session-cookie authentication, student-only registration, lecturer role middleware, password hashing, request validation, rate limiting, and error handling in `backend/src/app.js`.
- Verification: 13 direct API tests pass; the complete per-route authorization matrix is still pending.

## Milestone 3 — Modules/resources/groups

- Built module creation, join-code enrolment, study-group create/join, and validated resource upload endpoints.
- Verification: upload magic-byte, group-visibility, ownership and role tests pass; exhaustive matrix remains pending.

## Milestone 4 — AI/quiz generation

- Added deterministic FastAPI MockProvider endpoints with strict Pydantic quiz, mini-scope, and aggregate-analysis schemas.
- Verification: 4 pytest contract/security tests pass; persistent queue/status/worker wiring is present, integration tests remain pending.

## Milestone 5 — Quiz engine/scoring

- Built attempt start/submit transaction paths, server scoring, unanswered count, close-time checks, idempotent completed-result response, and database uniqueness guard.
- PGlite cannot fully prove row-locking concurrency; use `npm run test:db:real` with `REAL_TEST_DATABASE_URL`.

## Milestone 6 — Leaderboard/analytics

- Built derived leaderboard and lecturer weakest-topic analytics endpoints.
- Verification: endpoint exists; individual/group analytics and edge-case tests remain pending.

## Milestone 7 — Frontend

- Built responsive React shell implementing the DESIGN.md palette, sidebar navigation, dashboard, modules, leaderboard, analytics, and competitive-quiz warning views.
- Verification: production build passes; API-backed screen completion and axe/Playwright tests remain pending.

## Milestone 8 — Delivery

- Local run/test scripts and README foundation are present.
- Seed now creates demo lecturer/students, module, groups, resource, competitive/practice quizzes, and completed attempts. Remaining hardening includes backup/restore scripts, dependency audit remediation, clean-clone validation, and complete traceability evidence.
- Backup/restore scripts and a test-database round-trip check are now present. Browser/axe verification remains environment-dependent and not yet automated.

## Memory Match implementation — partial, 2026-10-28

Built and tested the deterministic Memory Match engine foundation: configurable eligible-pair card construction, kind-aware flips, pair resolution, scoring, terminal completion, and rejection of invalid flip sequences. The focused engine suite passes 4/4.

The backend start/resume and owner-scoped GET slice is implemented with the registered versioned Zod state and generic `game_plays` persistence. The behavioral authorization matrix covers both routes. Nine dedicated integration tests now prove start, same-play resume, eligibility minimum, enrolment and competitive access, lecturer ownership, whole-response answer secrecy, owner-only refresh, and isolation from attempts, leaderboards, and analytics.

Gate complete: the dedicated Memory Match suite passes 9/9 and the authorization matrix passes 39/39. The PGlite failure was test infrastructure: API test files left their shared `pg` pools open, while `npm test` relied on a long-lived daemon that was not owned by test setup/teardown. The recorded test PID remained alive after its listener disappeared, and reset failed with `read ECONNRESET`; dev and test already used separate ports/directories and Vitest file parallelism was already disabled.

The corrected runner keeps pure tests parallel, runs database files serially with one worker and a pool maximum of four, closes and leak-checks each file's pool, starts every database gate from a fresh isolated `.pgdata/test-suite`, waits for `select 1`, logs server termination, and tears the server down. A reporter makes any skipped test fail the gate. Three consecutive ordinary runs and one file-order-shuffled run each passed 192/192 tests with 0 skipped (83 pure/frontend and 109 DB/API per run).

Commits: Memory Match integration coverage `943b813`; PGlite lifecycle fix `4d2a936`. The authorization-matrix entries were already committed with the route slice in `f02bf47` before this gate and were not rewritten.

At that gate, the flip API, frontend screen, seed fixture, Playwright/axe flow, invariant/traceability/manual-test updates, and catalog enablement still remained. The engine remains frozen at commits `d0f4adc` and `7275051`. Timer Trivia, Boss Battle, and Pixel Car Racer were not started. Multiplayer was not started.

## FR-23 Memory Match — flip API slice — 2026-10-28

- Added the owner-scoped `POST /api/v1/games/memory-match/plays/:id/flip` endpoint with strict unknown-field rejection, a play row lock, frozen-engine application through a route-local state adapter, append-only moves, and atomic play-state/score/status updates.
- Duplicate delivery of the latest identical flip returns its stored response without appending or scoring twice. New moves against terminal plays, matched cards, face-up cards, same-kind pairs, and unknown cards return the standard 409/422 error shape.
- Mismatched cards remain face up for feedback; the next distinct flip atomically turns them down before beginning the next pair. Refresh returns only currently face-up or matched text, never an unflipped card's text.
- Added the flip route to the executable authorization matrix and added separately named integration coverage for full clear, mismatch recovery and clear, refresh, same-kind rejection, rapid duplicate serialization, replay, terminal rejection, text secrecy, and isolation from attempts/leaderboards/analytics.
- Gate: 202 JavaScript tests passed with 0 skipped (83 pure/frontend and 119 DB/API). Memory Match API passed 18/18 and the authorization matrix passed 40/40. Lint, formatting, and type-check passed. The frozen engine and PGlite infrastructure were not modified.

Remaining before FR-23 can be marked done: frontend screen, seed fixture, Playwright/axe flow, invariant/traceability/manual-test updates, and production catalog enablement. No other game or multiplayer work was started.

## FR-23 Memory Match — completed solo gate — 2026-10-28

- Baseline stability was proved before slice work with three consecutive `npm test` runs. Each run passed 208/208 tests with zero skipped: 89 pure/frontend and 119 DB/API. No worker exit, connection reset, leaked process, or skipped database test occurred.
- Expanded the demo practice quiz to 25 concise, explained questions spanning five topics and all five difficulty levels. The seed transaction now checks the counts and requires at least eight Memory-eligible pairs before committing.
- Added a stateful Memory Match Playwright/axe journey covering concealed backs, keyboard flip, mismatch flip-back, match locking, server-owned resume after reload, full clear, terminal UI, and the competitive pre-attempt lock. It passes in Chromium and Firefox at 390, 768, and 1280 pixels.
- Added INV-37 through INV-42, the FR-23 rule-to-test map, ERD notes, strict STATUS evidence, and the manual full-clear/refresh smoke script.
- The pre-enable gate passed first. Migration 009 then enabled `memory_match` in the data-driven catalog.
- Final gate: lint, Prettier, TypeScript, production build, 208/208 JavaScript tests, and 30/30 Playwright/axe project runs passed with zero skipped.
- FR-23 solo is done and tested. Timer Trivia, Boss Battle, Pixel Car Racer, and all multiplayer work remain untouched.

## FR-25 Boss Battle — persistence and API slice — 2026-10-28

- Kept the pure engine frozen at commit `f7ec23d` and added a strict versioned Boss Battle state schema registered with the generic game-state registry.
- Added start/resume, owner refresh, and row-locked answer routes under `/api/v1/games/boss-battle`. They use `canAccessGame`, require 12 eligible questions, reject unknown fields, conceal correctness before answer, validate option/question scope, append immutable moves, rebuild state from the latest move snapshot, and replay duplicate answers without applying damage twice.
- Added all three routes to the executable authorization inventory. The matrix passes 43/43 and covers unauthenticated/revoked sessions, ownership, strict validation, success shapes, and answer secrecy; both students and owning lecturers are valid roles, so a dual-role route has no applicable wrong-role case.
- Added 14 named integration tests covering win, loss, exhaustion, move-log refresh, replay, invalid/no-pending answers, competitive access, eligibility, enrolment, lecturer ownership, pre-answer secrecy, cross-user ownership, and scored-data isolation.
- Gate: 240/240 JavaScript tests passed with zero skipped (104 pure/frontend and 136 DB/API). Lint, Prettier, and TypeScript passed.
- Boss Battle remains disabled. Frontend, seed coverage, browser/axe evidence, final documentation, and catalog enablement remain for later slices. No database migration was added.

## FR-25 Boss Battle — completed solo gate — 2026-10-29

- Added the responsive Boss Battle screen with an original four-state vector boss, textual boss/player HP bars, keyboard-operable answers, live feedback with correct answer and explanation, and win/loss/exhausted terminal screens.
- Added 7 component test cases and a stateful Playwright/axe flow that covers a wrong answer, hard-question damage, a full win, the competitive pre-attempt lock, and both browser engines at 390, 768, and 1280 pixels.
- The demo practice quiz already contains 25 explained questions over five topics and all five levels; the seed now explicitly refuses to commit unless at least 12 are Boss Battle eligible.
- Three consecutive complete pre-enable gates each passed lint, Prettier, TypeScript, production build, 248/248 JavaScript tests with zero skipped, and 36/36 browser/axe project runs.
- A Firefox race in an older Infected flow was fixed separately in `e14d708` by waiting for real mocked responses; no assertion was removed. Migration 010 then enabled `boss_battle` and made new-quiz game attachment data-driven from enabled catalog rows.
- Boss Battle solo is done and tested. Timer Trivia, Pixel Car Racer, and all multiplayer modes remain out of scope and disabled.

## FR-26 Pixel Car Racer — pure engine — 2026-10-29

- Added the configurable pure solo-race engine with speed bounds, distance, streak, next-question nitro activation, doubled nitro points/slot consumption, deterministic bot simulation, distance/points tie-breaking, and terminal immutability.
- Added worked-example, transition, deterministic, uniqueness, terminal, minimum-question, and property-based tests. The engine is frozen after this part's green commit.
- Remaining: Part 2 persistence/routes/integration coverage, then Part 3 frontend, seed, six-project Playwright/axe flow, documentation, three full gates, and catalog enablement. Timer Trivia remains untouched and multiplayer remains out of scope.
- Frozen-engine correction: bot simulation now preserves the server-selected question order exactly and randomizes only bot correctness. A regression assertion covers the shared-list rule.

## FR-26 Pixel Car Racer — persistence and API — 2026-10-29

- Added a strict versioned Pixel Racer state registered with generic `game_plays` and append-only `game_play_moves`, including the server-selected question list and deterministic Bot result.
- Added start/resume, owner refresh, and row-locked answer routes with `canAccessGame`, ten-question eligibility, strict unknown-field rejection, option/question validation, idempotent replay, concealed correctness, and server-owned movement/scoring/outcome.
- Added all three routes to the behavioral authorization matrix and dedicated integration coverage for the nitro worked run, resume, duplicate answer, invalid option/fields, competitive access, eligibility/enrolment, lecturer ownership, cross-user ownership, and scored-data isolation.
- Remaining: Part 3 frontend, seed proof, six-project Playwright/axe flow, final invariant/traceability/manual docs, three full gates, and catalog enablement. Timer Trivia and multiplayer remain untouched.

## FR-26 Pixel Car Racer — completed solo-vs-Bot gate — 2026-10-30

- Added the responsive two-car race screen with original CSS pixel art, textual speed/streak/slots/score state, explicit nitro messaging, keyboard-operable answers, server feedback, and player/Bot/shared terminal outcomes.
- The 25-question demo practice quiz spans five topics and all five levels with explanations; seed validation now explicitly requires at least 10 Pixel Racer-eligible questions.
- Added 7 component test cases and a stateful Playwright/axe flow covering the four-answer streak, next-question nitro, doubled slot use, seven-answer worked finish, result, and competitive pre-attempt lock in Chromium and Firefox at 390, 768, and 1280 pixels.
- Three consecutive pre-enable gates each passed lint, Prettier, TypeScript, production build, 277/277 JavaScript tests with zero skipped (128 pure/frontend and 149 DB/API), and 42/42 Playwright/axe project runs.
- Added INV-49 through INV-55 and the FR-26 rule mapping, ERD, status, and manual smoke evidence. Migration 011 enables only `pixel_racer` after those gates passed.
- Pixel Car Racer solo-vs-Bot is done and tested. Timer Trivia is the only remaining requested solo game; multiplayer remains out of scope.

## FR-24 Timer Trivia — pure engine — 2026-10-30

- Added the configurable pure solo engine for a five-level topic board, ten server-timed rounds, cell-owned points, timeout scoring, extended-time deadlines, distinct-cell use, refresh-stable active rounds, and terminal immutability.
- All game numbers are centralized in `backend/src/games/timer_trivia/config.js`; seeded selection is deterministic and the engine has no I/O.
- Part 5 persistence/routes/integration tests and Part 6 frontend/seed/browser/docs/catalog enablement remain. Timer Trivia stays disabled; multiplayer remains out of scope.

## FR-24 Timer Trivia — persistence and API — 2026-10-30

- Registered a strict versioned Timer Trivia state over generic `game_plays` and append-only `game_play_moves`, with board cells, active server deadline, score, answered questions, and terminal status validated on every transition.
- Added start/resume, owner refresh, row-locked cell choice, and row-locked answer routes. The server owns cell availability, correctness, points, timeout decisions, round count, and status; pre-answer responses contain no correctness.
- Added the persisted `users.extended_time` preference through migration 012. It doubles the server deadline and cannot be supplied in a game request.
- Added 11 integration tests for 50-point scoring, timeout, replay, cell/option scope, refresh, extended time, eligibility/enrolment, competitive access, lecturer ownership, strict fields, finish/personal-best, and scored-data isolation. All four routes are in the executable authorization matrix.
- Part 6 frontend, seed/browser evidence, final docs, three complete gates, and catalog enablement remain. Timer Trivia stays disabled; multiplayer remains out of scope.

## FR-24 Timer Trivia — completed solo gate — 2026-10-30

- Added the responsive Timer Trivia board, server-timed question/answer flow, feedback and terminal UI, plus 4 component tests.
- Added a seeded board-cell coverage assertion and six-project Playwright/axe coverage in Chromium and Firefox at 390, 768, and 1280 pixels.
- The Timer-specific pre-enable checks passed: lint, formatting, type-check, build, 153 pure/frontend tests and 164 DB/API tests with zero skipped; the initial full browser run found a real contrast defect, fixed in the gate work, and the targeted rerun passed 6/6.
- Migration 013 enables `timer_trivia` only after the complete three-gate verification. Multiplayer and all other unfinished work remain out of scope.

## 2026-11-01 — Duplicate quiz cleanup and test isolation

- Created and verified the pre-cleanup JSON backup at `C:\Users\User\Desktop\EduQuest-backups\20261101-092536\eduquest-dev.json` before changing the development database.
- Removed only the identified Browser smoke quizzes and duplicate Demo competitive/practice records, with dependent rows deleted transactionally. The development database now has 8 quizzes, 91 questions, 5 attempts and 0 game plays; DEMO101 and the presentation module data were retained.
- Browser tests now create and seed a fresh `.pgdata/e2e-suite` database on port 55434 and run their own backend/AI/frontend stack on ports 4191/8191/5191. Three complete browser runs passed with 54/54 each and zero skipped.
- `npm run seed` is stable-key idempotent; `npm run test:seed` passed with unchanged counts after a second seed, preserved play data, cancellation, and production refusal. Quiz lists now support newest-first pagination and title search.

## Games chooser — completed

- Added the data-driven Games catalogue page and student/lecturer navigation entry.
- Added shared availability logic for catalogue cards, quiz picker, and quiz Games area, including enrollment, publication, closure, competitive-attempt, and minimum-question reasons.
- Added search, newest-first pagination, resume badges, continue actions, responsive cards, accessible status text, and a disabled multiplayer Coming soon card.
- Added four API routes, unit/API/frontend/matrix coverage, and six-project Chromium/Firefox axe coverage at 390, 768, and 1280.
- Gate evidence: 162 pure/frontend tests and 171 DB/API tests passed, 0 skipped; lint, format, type-check, build, and chooser browser/axe checks passed. Remaining action is the required repeated full browser gate, then commit.

## Games chooser — final gate and infrastructure hardening

- Full browser gate: 3 consecutive runs, each 60/60 passed with zero skips across Chromium and Firefox at 390, 768, and 1280 pixels.
- Full offline gate: 3 runs passed lint, format, type-check, production build, 162 pure/frontend tests, and 171 DB/API tests with zero skips.
- Fixed a real repeated-run PGlite infrastructure race: Windows could retain the prior fixed `test-suite` directory while the next reset recreated it, producing `could not create directory "base/5": File exists`. Each DB test process now gets a unique fresh suite directory and removes it after teardown. No application logic or test assertions were weakened.

## Lecturer module creation

- Added a lecturer-only Create a module form on the Modules page.
- The form posts the module code and name to the existing secured `POST /api/v1/modules` endpoint, displays the generated JoinCode, and keeps the existing student enrolment flow unchanged.
- Evidence: focused frontend suite 43/43 passed; full suite passed 163 pure/frontend and 171 DB/API tests with zero skips on the final run; lint and type-check passed.

## Registration and login improvement — identity slice

- Added migration 016 for split names, student type, email verification state, hashed verification tokens, and MFA storage/key scaffolding while preserving existing `full_name` data and legacy fixtures.
- Added server-side Zod validation for Unicode names, email normalization, password composition, password confirmation, student type, duplicate emails, and profanity.
- Added development-only file mailer and single-use 24-hour verification endpoint.
- Added frontend split-name fields, student type selection, live text strength meter, and 44 frontend identity tests plus 7 identity API tests.
- Gate result: 179 pure/frontend and 179 DB/API tests passed with zero skips; lint and type-check passed.
- Added the MFA backend: AES-256-GCM encrypted TOTP secret, QR data URL enrolment, RFC 6238 confirmation, five-minute login challenges, replay protection, one-use recovery codes, five-attempt challenge lockout, and account lockout tracking.
- Remaining: lecturer MFA enforcement, MFA frontend, and browser/axe coverage are intentionally deferred to the next slice.

## 2026-11-01 — Module and resource catalogue

- Built and tested migration 019 for module Year/Programme/Offering/Description and student Year, with conservative legacy backfill.
- Added owner-scoped, paginated `/me/modules`, first-year-only `/me/modules/lookahead`, and `/resources/modules` endpoints; filtered resource lists retain group visibility rules.
- Added responsive module cards, first-year read-only preview, resource tiles, module picker, search and pagination. Added API, component, authorization-matrix, Playwright and axe coverage.
- Gates: lint, format, type-check, production build, 169 unit/frontend tests, 210 DB/API tests, and 72 browser projects passed with zero skips. Dedicated catalogue browser checks passed at Chromium/Firefox 390/768/1280 with zero axe violations.
- Remaining: no new game or multiplayer work was started. The feature is not committed yet in this working turn.

## 2026-11-01 — Study groups

- Added group languages, focus, description, visibility, leaders/co-leaders, updates and last-leader protection.
- Added scoped group routes with profanity checks and deterministic recommendations.
- Added study-group cards with filters, recommendation reasons, language chips and membership actions, plus API/unit/frontend/browser/axe tests.

## 2026-11-01 — Lecturer AI generation controls

- Added strict generation metadata for quiz mode, title and optional closing time, persisted on `ai_generation_jobs` and used by the worker when creating the draft quiz.
- Added lecturer-only AI status, cancel and retry endpoints; queued jobs expose elapsed time and a diagnostic message, and the worker marks queued jobs older than ten minutes as failed.
- Fixed the launcher path so it starts the persistent AI worker alongside the backend, AI service and frontend.
- Added frontend controls and editable draft metadata for Practice/Competitive mode, title and closing time, plus queued-job cancel/retry/status states.
- Evidence so far: frontend 49/49 and DB/API focused tests 29/29; authorization matrix 78/78; full JavaScript suite 172 pure/frontend and 228 DB/API, zero skipped. Browser gate and final lint/format/type-check/build remain to run.

## 2026-11-01 — Practice Lab / IT Code Lab

- Added migration 022 with module-scoped `labs` and owner-scoped `lab_attempts`.
- Added strict Zod-backed lab create/edit/read/save routes, profanity checks, student enrollment visibility, lecturer ownership and aggregate activity.
- Added a browser-only Code Lab with HTML/CSS/JavaScript tabs, line numbers, sandboxed CSP preview, watchdog, console, declarative checks, reset, hint and draft save.
- Added seeded IT first-year Code Labs and Playground creation by stable module/title keys.
- Focused gate: lab API 8/8; authorization matrix green after fixing PATCH default status unpublishing labs. Full frontend/browser gate remains to run.

## 2026-11-01 — Business Lab

- Added a bounded, non-executable spreadsheet formula evaluator with references, ranges, arithmetic, comparisons, percentages, supported functions, cycle detection and explicit error codes.
- Added strict spreadsheet, calculator and scenario configuration validation; student views hide expected check values and lab attempts remain self-checked/practice-only.
- Added student spreadsheet and calculator player screens, responsive grid styling, a safe inline break-even chart surface, and a dashboard Practice Lab card.
- Added seeded business lab definitions for budget, gross profit, payroll, break-even, ROI, loan repayment, VAT, gross margin and a market-expansion scenario.
- Evidence: formula tests 4/4, frontend component suite 53/53, labs API 9/9, targeted Business Lab browser/axe check 1/1 on Chromium tablet. Full browser matrix and final delivery gate remain to run.

- Final Business Lab gate evidence: formula/scenario 7/7, frontend JS 183/183, DB/API 244/244, Python 43/43, and Business Lab browser/axe 6/6 across Chromium/Firefox at 390/768/1280 with zero axe violations.
- Business Lab completion gate: 185 JavaScript tests, 248 DB/API tests, 43 Python tests, and 18 dedicated Business Lab browser/axe tests passed with zero skips. The full browser matrix produced 107/108 on its first run because one existing Firefox mobile seed smoke test was transiently empty; that exact test passed on an isolated rerun.

### Manual quiz authoring slice

Added the additive quiz authoring schema migration, shared strict validation, lecturer-only draft/publish/question routes, and a lecturer create-quiz form. Remaining: complete behavioural route assertions for destructive-route fixtures, short-answer submission integration, full authoring editor/preview polish, frontend component tests, and Playwright/axe coverage.

## 2026-11-02 — AI PDF generation follow-up (incomplete gate)

Fixed bounded source sampling, request deadlines, strict question-count checks,
cancellation persistence, stale-job expiry and safe lecturer failure guidance.
Tests: unit 138/138, frontend components 90/90, standalone database/API 328/328,
Python 51/51, focused MockProvider browser/axe 6/6; zero skipped and zero axe
violations. Lint, format, type-check and build passed.

The final combined suite crashed during database startup with Windows native
exit 3221226505 after its unit/component phase passed. The standalone DB pass
does not prove that crash resolved. Live five-question PDF generation still
times out (HTTP 504); no draft was saved. Further repeated live and native-crash
retries were stopped. Remaining work is diagnosed honestly in
`docs/AI_PDF_DIAGNOSIS.md`; FR generation is not declared complete.
