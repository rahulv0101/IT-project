# EduQuest traceability

Latest registration behavior: [OTP branch follow-up](REGISTRATION_OTP_2026-11-03.md),
including real Gmail inbox verification and the browser/API security matrix.

Live deployment evidence: [Vercel deployment](VERCEL_DEPLOYMENT.md).
Private file access, hosted PDF extraction, production sessions and real
OpenRouter persistence/submission are covered there.

Latest branch integration: [3 November 2026 review](BRANCH_MERGE_REVIEW_2026-11-03.md).
Password controls and scoped email resend are covered by `frontend/src/main.test.jsx`,
`frontend/e2e/system-sweep.spec.js`, `backend/tests/email.test.js`,
`backend/tests/identity-api.test.js` and the executable authorization matrix.

Latest system-wide evidence: [2 November 2026 validation](VALIDATION_2026-11-02.md).
That report supersedes historical pending status for the tested PostgreSQL,
OpenRouter, native backup and account-flow checks below.

Status reflects the current local implementation. PGlite evidence is explicitly not equivalent to real PostgreSQL concurrency evidence.

## Games chooser

| Requirement                                                     | Implementation                                                     | Evidence                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Games navigation and catalogue cards                            | `frontend/src/main.jsx` `GamesPage`; `GET /api/v1/games/catalogue` | `frontend/src/main.test.jsx` Games chooser tests; Playwright chooser/axe flow  |
| Descriptions and minimum-question tags come from catalogue data | migration `015_game_catalog_metadata.sql`; catalogue query         | `backend/tests/game-availability.test.js`; chooser API test                    |
| Enrolled-module quiz picker, search and pagination              | `GET /api/v1/games/quiz-picker`; `GamesPage` picker                | `backend/tests/api.test.js`; `frontend/src/main.test.jsx`                      |
| Exact unavailable reasons and resume badge                      | shared availability and in-progress routes                         | availability unit cases, API response assertions, frontend tests               |
| Same policy in chooser and quiz Games area                      | `backend/src/games/availability.js` used by both handlers          | availability unit tests and existing quiz Games API tests                      |
| API authorization and no answer/player-data leakage             | route policies and owner/enrolment checks                          | executable authorization matrix; chooser API secrecy assertions                |
| Responsive accessible card grid and coming-soon state           | `frontend/src/styles.css`, inline SVG icons, textual statuses      | frontend tests and Playwright/axe at all configured Chromium/Firefox viewports |

## Profanity field coverage

| User-visible field                | Backend authority                  | Evidence                                                                          |
| --------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| Full name at registration/profile | `nameSchema` / `noProfanity()`     | `backend/tests/profanity.test.js`; direct registration and profile-edit API tests |
| Module and study-group names      | `moduleSchema` / `groupSchema`     | API tests; profanity suite                                                        |
| Resource and quiz titles          | upload and quiz handlers           | API upload tests; profanity suite                                                 |
| Quiz questions/options and topics | quiz schema and AI worker re-check | direct API field matrix; worker integration tests                                 |

The backend never echoes the matched term or logs offending text. The filter has documented limits and requires periodic custom-list review.

| ID             | Implementation                                                    | Evidence/status                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-01          | `backend/src/app.js` registration                                 | API path implemented; route tests pending                                                                                                                          |
| FR-02          | `backend/src/app.js` login/logout/session cookie                  | API path implemented; route tests pending                                                                                                                          |
| FR-03          | `requireRole` and session role                                    | API path implemented; route tests pending                                                                                                                          |
| FR-04          | Module creation endpoint                                          | API path implemented; route tests pending                                                                                                                          |
| FR-05          | Enrollment and module listing                                     | API path implemented; route tests pending                                                                                                                          |
| FR-06          | Resource upload endpoint                                          | API path implemented; upload matrix pending                                                                                                                        |
| FR-07          | Resource authorization and secure file opening                    | automated: ownership, enrolment and group-scope tests in `backend/tests/module-resource-catalogue-api.test.js`; route matrix; component and Playwright link checks |
| FR-08          | Study group create/join endpoints                                 | API path implemented; route tests pending                                                                                                                          |
| FR-09          | Group resource visibility                                         | automated: group visibility API test                                                                                                                               |
| FR-10          | AI service contracts                                              | `ai-service/app.py` implemented                                                                                                                                    |
| FR-11          | Quiz persistence and AI job integration                           | automated: `backend/tests/ai-worker.test.js`, `frontend/src/main.test.jsx`; games partial, pending team decision                                                   |
| FR-12          | Attempt start question delivery                                   | automated: `backend/tests/api.test.js`                                                                                                                             |
| FR-13          | Answer persistence                                                | automated: `backend/tests/api.test.js`                                                                                                                             |
| FR-14          | Server-side scoring                                               | automated: `backend/tests/api.test.js`                                                                                                                             |
| FR-15          | Competitive attempt guard                                         | automated: DB invariant and API suites                                                                                                                             |
| FR-16          | Derived leaderboard                                               | automated: ranking and module/group scope API test                                                                                                                 |
| FR-17          | Student leaderboard authorization                                 | automated: student scope and role boundary API test                                                                                                                |
| FR-18          | Individual analytics                                              | automated: `/api/v1/me/analytics` API test                                                                                                                         |
| FR-19          | Group analytics                                                   | automated: group average API test                                                                                                                                  |
| FR-20          | Module/topic analytics                                            | automated: lecturer weak-topic API test                                                                                                                            |
| FR-21          | `backend/src/profanity/` and visible-text schemas                 | automated: field matrix API tests and worker re-checks                                                                                                             |
| FR-22          | Infected solo engine, persistent sessions, API, and responsive UI | automated: engine property tests, DB invariants, API win/loss/exhaustion/access tests, frontend flow tests, Playwright/axe flow                                    |
| FR-23          | Memory Match solo engine, persistence, API, and responsive UI     | automated: engine/property, API, authorization-matrix, component, and six-project Playwright/axe coverage; rule mapping below                                      |
| FR-24          | Timer Trivia solo engine, persistence, API, and responsive UI     | automated: 10 engine, 11 API, 4 component, authorization-matrix, and six-project Playwright/axe coverage; rule mapping below                                       |
| FR-25          | Boss Battle solo engine, persistence, API, and responsive UI      | automated: 15 engine, 15 API, 7 component, authorization-matrix, and six-project Playwright/axe coverage; rule mapping below                                       |
| FR-26          | Pixel Car Racer solo-vs-Bot engine, persistence, API, and UI      | automated: 10 engine, 9 API, 7 component, authorization-matrix, and six-project Playwright/axe coverage; rule mapping below                                        |
| FR-27          | Multiplayer room layer                                            | not started; no room persistence, SSE, or multiplayer behavior                                                                                                     |
| FR-28          | Island Escape solo survival game                                  | automated: pure-engine/property tests, DB invariants, API access/win/setback/replay/isolation tests, component tests, Playwright/axe flow                          |
| NFR01          | Async AI job architecture                                         | automated: `backend/tests/ai-worker.test.js`                                                                                                                       |
| NFR02          | bcrypt and secure session cookies                                 | API implementation present                                                                                                                                         |
| NFR03          | RBAC middleware                                                   | API implementation present                                                                                                                                         |
| NFR04          | React design system                                               | automated: login axe passes in six browser/viewports; manual and remaining screens pending                                                                         |
| NFR05          | Responsive CSS                                                    | automated: generation smoke passes at 390/768/1280 in both browsers; full-screen manual review pending                                                             |
| NFR06          | Transactional submission                                          | API transaction path; real concurrency pending                                                                                                                     |
| NFR07          | Database constraints/triggers                                     | 10 DB invariant tests passed                                                                                                                                       |
| NFR08          | Zod/Pydantic validation                                           | Current API/AI schemas implemented                                                                                                                                 |
| NFR09          | Upload size limit                                                 | Size limit implemented; magic-byte tests pending                                                                                                                   |
| NFR10          | Browser compatibility                                             | automated: 48 browser tests pass (24 Chromium, 24 Firefox), zero skips at 390/768/1280; complete product coverage pending                                          |
| NFR11          | Separate frontend/backend/AI modules                              | Implemented                                                                                                                                                        |
| NFR12          | Indexes and query paths                                           | Foundation indexes present                                                                                                                                         |
| NFR13          | Backup/recovery                                                   | Native `npm run backup:pg`/`restore:pg` against real PostgreSQL; JSON fallback is separately tested and does not satisfy native-dump evidence                      |
| NFR14          | Resource-level authorization                                      | Automated aggregate projection evidence in `backend/tests/api.test.js`; the broader legacy matrix limitations remain documented                                    |
| NFR15          | Strict AI schemas                                                 | automated: Pydantic and worker tests for difficulty/explanation shape, instruction text, length, profanity, and non-persistence                                    |
| NFR16          | Generic error responses                                           | API error handler implemented                                                                                                                                      |
| NFR17          | Profanity, generic rejection, cooldown                            | 25 profanity tests passed; API/AI integration pending                                                                                                              |
| INV-01, INV-13 | Competitive uniqueness and atomic submission                      | PGlite passes; `npm run test:db:real` required for full row-lock verification                                                                                      |

Infected, Island Escape, Memory Match, Boss Battle, Pixel Car Racer, and Timer Trivia are enabled and practice-only. Flashcards remains disabled; `speed_round` and `match_pairs` are removed. All game results remain isolated from quiz attempts, leaderboards, and scored analytics.

Automated axe/Playwright and the manual checklist remain required before NFR04/NFR05/NFR10 can be marked done. `npm run test:db:real` fails loudly unless `REAL_TEST_DATABASE_URL` is supplied; concurrency evidence is therefore marked “needs real PostgreSQL” under PGlite.

The executable matrix has 46 passing tests and includes all Pixel Racer, Boss Battle, Memory Match, Infected, and Island Escape routes plus the aggregate generic-game activity route. Dedicated game integration fixtures additionally prove real session/play ownership, module ownership, exact 422 unknown-field rejection, pre-answer response secrecy, and success shapes. The generic activity response is asserted to contain no student, state, question, or option data. Older routes retain the limitations documented by their existing matrix assertions, so NFR14 remains partial overall.

## Infected invariant evidence

| Invariant | Enforcement                                         | Automated evidence                                       |
| --------- | --------------------------------------------------- | -------------------------------------------------------- |
| INV-16    | Cure check plus engine clamp                        | `database.invariants.test.js`, `infected-engine.test.js` |
| INV-17    | Hearts check plus engine clamp                      | `database.invariants.test.js`, `infected-engine.test.js` |
| INV-18    | Answer trigger and transition table                 | DB raw SQL, API loss run                                 |
| INV-19    | Immutable answered turn, terminal engine/API guards | raw SQL, terminal/replay API tests                       |
| INV-20    | Unique session/question cards                       | raw SQL, card selection and exhaustion tests             |
| INV-21    | Dedicated pre-answer serializers                    | API disclosure assertions and frontend tests             |
| INV-22    | Separate game persistence                           | leaderboard/attempt isolation API test                   |
| INV-23    | Catalog lookup and enabled flag                     | raw SQL catalog assertion                                |

## Shared game-platform foundation evidence

| Invariant | Enforcement                                           | Automated evidence                                      |
| --------- | ----------------------------------------------------- | ------------------------------------------------------- |
| INV-24    | Difficulty level check and shared tier mapping        | DB, API, AI worker, and `game-foundation.test.js`       |
| INV-25    | Versioned JSONB plus game-owned Zod state schema      | DB and `game-foundation.test.js`                        |
| INV-26    | One in-progress solo play per game/user/quiz          | DB partial-unique test                                  |
| INV-27    | Uniquely ordered append-only move log                 | DB trigger/constraint test                              |
| INV-28    | Terminal generic plays reject moves                   | DB trigger test                                         |
| INV-29    | Lecturer progress is owned-module aggregate data only | Authorization-matrix ownership and response-shape tests |

## Island Escape invariant evidence

| Invariant | Enforcement                                    | Automated evidence                                    |
| --------- | ---------------------------------------------- | ----------------------------------------------------- |
| INV-30    | Immediate setback transition and bounded state | engine property/worked examples and raw SQL           |
| INV-31    | Monotonic score engine and update trigger      | property, replay, API, and raw SQL tests              |
| INV-32    | Strict Zod/SQL doubling-streak relationship    | engine transition/property and raw SQL tests          |
| INV-33    | Engine/state/SQL setback terminal bound        | engine, API fourth-setback run, and raw SQL tests     |
| INV-34    | Attempt-scoped unique question index           | selection/property and raw SQL tests                  |
| INV-35    | Pre-answer serializers omit correctness        | API, component, and Playwright assertions             |
| INV-36    | Separate practice-only persistence             | API leaderboard/attempt/analytics isolation assertion |

## Memory Match rule and invariant evidence

| Rule / invariant                                                            | Enforcement                                                    | Automated evidence                                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Minimum six eligible pairs; question ≤140 and correct answer ≤60 characters | Server eligibility query and centralized config                | Engine eligibility test; API “refuses fewer than six eligible questions”; seed coverage assertion            |
| Question and answer card backs are distinguishable                          | Card `kind` in the concealed client view                       | Component availability/rendering test; six-project Playwright flow                                           |
| Unflipped text and pairing stay secret (INV-37)                             | Opaque IDs and dedicated client-view serializer                | Engine metadata test; start/GET/flip whole-response disclosure tests; Playwright pre-flip assertion          |
| Only opposite kinds can form a pair (INV-38)                                | Frozen pure-engine guard and API transaction                   | Engine invalid-flip test; API “rejects a same-kind second flip”                                              |
| Match locks cards; mismatch turns them down before the next flip            | Engine transition and persisted face state                     | API full-clear/mismatch tests; component match/mismatch tests; Playwright full flow                          |
| Score is `max(0, 10 × matches − mismatches)` (INV-39)                       | Server-owned engine state                                      | Engine scoring test; API full-clear and mismatch-clear tests                                                 |
| Resume and refresh preserve only face-up/matched disclosure                 | Partial active-play uniqueness and persisted state             | Same-play resume, API refresh, component refresh, and Playwright reload evidence                             |
| Replay/rapid delivery applies once (INV-40)                                 | Row lock, ordered append-only moves, replay response           | API rapid duplicate and replayed-identical-flip tests                                                        |
| Finished plays reject moves (INV-41)                                        | Engine/API terminal guards and generic DB trigger              | Engine terminal behavior and API finished-play rejection                                                     |
| Access uses `canAccessGame`                                                 | Enrollment, competitive-attempt, and lecturer ownership checks | Dedicated not-enrolled, before/after scored-attempt, and lecturer ownership API tests; Playwright lock state |
| Game output is practice-only (INV-42 / INV-09)                              | Generic game tables are separate from scored attempts          | Start and full-play isolation integration tests                                                              |
| Keyboard, reduced-motion, responsive, and axe coverage                      | Accessible React controls/CSS                                  | Six Playwright/axe projects: Chromium and Firefox at 390/768/1280; component reduced-motion test             |

## Boss Battle rule and invariant evidence

| Rule / invariant                                              | Enforcement                                                     | Automated evidence                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Minimum 12 eligible questions                                 | Central config and server eligibility query                     | Engine refusal, API under-minimum, catalog eligibility, and seed coverage tests   |
| Tier damage table and bounded HP (INV-43/INV-44)              | Frozen pure engine using shared `tierOf()`                      | Six transition cases, clamp/property tests, API win/loss, component HP assertions |
| Server-shuffled questions never repeat (INV-46)               | Seeded question queue persisted in versioned state              | Engine property/no-repeat and API exhaustion tests                                |
| Terminal plays reject moves and replay is idempotent (INV-45) | Engine guard, row lock, append-only moves, generic DB trigger   | Terminal immutability, duplicate answer, refresh/rebuild, and authorization tests |
| Correctness remains hidden until answer (INV-47)              | Pending-question serializer omits correctness                   | API whole-response secrecy, component pre-answer, and six-project browser checks  |
| Practice output isolation (INV-48/INV-09)                     | Generic game storage is separate from quiz attempts             | API leaderboard/attempt/analytics isolation test                                  |
| Access uses `canAccessGame`                                   | Enrollment, competitive completion, and lecturer ownership      | Dedicated API access cases and competitive-lock browser assertion                 |
| Responsive and accessible presentation                        | Original SVG, textual HP, keyboard controls, live feedback, CSS | Component state tests and axe in Chromium/Firefox at 390, 768, and 1280 pixels    |

## Pixel Car Racer rule and invariant evidence

| Rule / invariant                                                          | Enforcement                                                      | Automated evidence                                                                   |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Minimum 10 questions and ten race slots                                   | Central config and server eligibility query                      | Engine refusal, API under-minimum, seed assertion, and competitive-lock browser flow |
| Speed stays 1..5; distance is monotonic (INV-49)                          | Frozen pure engine clamps and versioned state schema             | Transition bounds and property tests; component/API state assertions                 |
| Score is server-owned and never negative (INV-50)                         | Strict answer schema and pure scoring transition                 | Forged-field matrix, property, API, and UI tests                                     |
| Four-correct streak activates nitro on the next question (INV-51)         | Ordered transition using one centralized config                  | Worked seven-answer finish, nitro start/end, component, and Playwright tests         |
| Nitro doubles distance/points and correct answers consume two slots       | Engine transition and persisted slot count                       | Worked-example engine/API tests and stateful browser flow                            |
| Player and deterministic Bot share one question list (INV-53)             | Server selection plus Bot correctness-only RNG                   | Shared-list regression, deterministic Bot, and no-repeat tests                       |
| Terminal moves reject; duplicate delivery is idempotent (INV-52)          | Engine guard, row lock, append-only moves, generic DB trigger    | Terminal/replay engine and API tests                                                 |
| Correctness remains hidden until answer (INV-54)                          | Pending-question serializer                                      | Whole-response API, component, and Playwright assertions                             |
| Practice results are isolated (INV-55/INV-09)                             | Generic game tables remain separate from scored quiz persistence | API leaderboard/attempt/analytics isolation test                                     |
| Keyboard, textual status, reduced motion, and responsive/axe presentation | Accessible controls, CSS media query, live feedback              | Component tests and Chromium/Firefox axe flows at 390, 768, and 1280 pixels          |

FR-22 Stage 1 gate evidence: 131 JavaScript tests, 4 Python tests, and 18 browser tests passed with zero skips. Lint, Prettier, TypeScript, and the production frontend build also pass. Earlier assertion totals were manually estimated and are not treated as verified behavioral evidence.

FR-23–FR-27 Stage 0 gate evidence: 141 JavaScript tests, 4 Python tests, and 18 Chromium/Firefox browser tests passed with zero skips. Lint, Prettier, TypeScript, and the production frontend build passed. This was foundation evidence only; Memory Match has since passed its individual gate, while the other three solo games and multiplayer remain not started.

FR-28 gate evidence: 177 JavaScript tests, 4 Python tests, and 24 Chromium/Firefox browser tests passed with zero skips. Island-specific evidence includes 14 engine/property tests, 11 API integration tests, DB INV-30–INV-34 assertions, component coverage for question/answer/setback/terminal/resume/error states, and axe/keyboard checks at 390/768/1280. All 35 inventoried routes pass the executable authorization-matrix guard. Lint, Prettier, TypeScript, and production build pass.

FR-23 gate evidence: 208 JavaScript tests passed with zero skips (89 pure/frontend and 119 DB/API). Memory Match contributes 4 engine tests, 18 API integration tests, 6 component tests, and coverage in the 40-test executable authorization matrix. The complete browser gate passed 30/30 project runs: 15 Chromium and 15 Firefox at 390, 768, and 1280 pixels, including Memory Match full clear, mismatch, refresh, keyboard operation, concealment, terminal state, competitive lock, and axe analysis. Lint, Prettier, TypeScript, and production build pass.

FR-25 gate evidence: three consecutive complete pre-enable gates each passed lint, Prettier, TypeScript, production build, 248/248 JavaScript tests with zero skipped (111 pure/frontend and 137 DB/API), and 36/36 Playwright/axe project runs. Boss Battle contributes 15 engine tests, 15 API tests, 7 component test cases, three authorization-matrix routes, and one full flow in each Chromium/Firefox viewport at 390, 768, and 1280 pixels. Migration 010 enables the catalog entry only after those gates passed.

FR-26 gate evidence: three consecutive complete pre-enable gates each passed lint, Prettier, TypeScript, production build, 277/277 JavaScript tests with zero skipped (128 pure/frontend and 149 DB/API), and 42/42 Playwright/axe project runs. Pixel Racer contributes 10 engine/property tests, 9 API integration tests, 7 component test cases, three authorization-matrix routes, and one stateful nitro/race/competitive-lock flow in each Chromium/Firefox viewport at 390, 768, and 1280 pixels. Migration 011 enables the catalog entry only after those gates passed.

FR-24 gate evidence: Timer Trivia contributes 10 engine/property tests, 11 API integration tests, 7 frontend component/visual tests, four authorization-matrix routes, and 6/6 targeted Playwright/axe runs in Chromium and Firefox at 390, 768, and 1280 pixels. `frontend/src/timer-trivia.test.jsx` separately proves one-time 10-second/5-second announcements, refresh persistence, and extended-time thresholds; the Playwright flow asserts both threshold messages. Migration 013 enables the catalog entry only after the three complete gates pass. The board, server deadline, timeout, extended-time preference, cell reuse, pre-answer secrecy, and practice-data isolation are covered by the listed engine/API/browser tests.
The chooser implementation is covered by 6 availability unit tests, the API chooser integration test, 2 frontend chooser tests, the 54-test authorization matrix (including the four new routes), and the six-project Chromium/Firefox axe flow at 390/768/1280. The availability policy is shared by the chooser and quiz Games area through `backend/src/games/availability.js`. The full browser gate passed 60/60 in each of three runs; the repeated DB gate passed 171/171 after the unique-directory PGlite teardown fix.

## Registration and login improvement

The identity slice is covered by 7 identity API tests, 44 frontend authentication/component tests, and the 60-route authorization matrix. The MFA backend is covered by 5 named integration tests for enrolment, fixed-clock TOTP confirmation, login challenge/replay, recovery-code single use, lockout, disable and regeneration. MFA frontend, lecturer enforcement, and browser coverage are intentionally outside this slice.
| Profile management | Editable identity, language preferences, email re-verification, password/session rotation and MFA status | automated: `backend/tests/profile-api.test.js` (7 tests), authorization matrix |

## Module and resource catalogue slice

| Requirement                                                                            | Status    | Evidence                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enrolled modules load immediately with search, sort, counts and in-progress game state | automated | `GET /api/v1/me/modules`, `backend/tests/module-resource-catalogue-api.test.js`, `frontend/src/main.test.jsx`                                                                    |
| First-year look-ahead is read-only and excludes resources, quizzes and answers         | automated | `GET /api/v1/me/modules/lookahead`, `backend/tests/module-resource-catalogue-api.test.js`                                                                                        |
| Resource tiles, module jump list, title search and pagination are owner/group scoped   | automated | `GET /api/v1/resources/modules`, filtered resource route, `backend/tests/module-resource-catalogue-api.test.js`, `frontend/src/main.test.jsx`                                    |
| Students can open visible files through an authenticated, non-leaking file route       | automated | `GET /api/v1/resources/:resourceId/file`, `backend/tests/module-resource-catalogue-api.test.js`, authorization matrix, `frontend/src/main.test.jsx`, `frontend/e2e/main.spec.js` |
| New catalogue routes are authorization-matrix covered                                  | automated | `backend/src/authorization-matrix.js`, `backend/tests/authorization-matrix.test.js`                                                                                              |

## Study groups

| Requirement                                                                | Status    | Evidence                                                                                        |
| -------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| Group languages, focus, description, visibility, leaders and updates       | automated | migration 020, `backend/tests/study-groups-api.test.js`                                         |
| Scoped listing, filters, pagination, recommendation reasons and membership | automated | `GET /api/v1/groups`, `backend/tests/study-groups-api.test.js`, `frontend/src/main.test.jsx`    |
| Leadership, updates, join/leave and profanity authorization                | automated | `backend/src/authorization-matrix.js`, `backend/tests/authorization-matrix.test.js` (75 routes) |
| Responsive accessible group page                                           | automated | `frontend/e2e/main.spec.js`, Chromium/Firefox at 390/768/1280 with axe                          |

## Lecturer AI generation controls

| Requirement                                                                | Status    | Evidence                                                                                       |
| -------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| Generation mode, title and closing time are server-validated and persisted | automated | `backend/src/app.js`, migration 021, `backend/tests/api.test.js`                               |
| Worker is started by the local launcher and advances queued jobs           | automated | `Start-EduQuest.ps1`, `scripts/run-worker.ps1`, `backend/tests/ai-worker.test.js`              |
| Stuck jobs expose elapsed time, diagnostics, cancel and retry actions      | automated | `frontend/src/main.jsx`, `frontend/src/main.test.jsx`, `frontend/e2e/main.spec.js`             |
| New AI routes are authorization-matrix covered                             | automated | `backend/src/authorization-matrix.js`, `backend/tests/authorization-matrix.test.js` (78 tests) |

## Practice Lab / IT Code Lab

| Requirement                                                                           | Status                 | Evidence                                                                                             |
| ------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| FR-29: published labs are scoped to enrolled students and owned lecturers             | automated              | `backend/src/app.js`, `backend/tests/labs-api.test.js`, `backend/tests/authorization-matrix.test.js` |
| IT Code Lab editor, tabs, line numbers, reset, hint and responsive preview            | implemented, tested    | `frontend/src/main.jsx`, `frontend/src/styles.css`, frontend component tests                         |
| Browser sandbox has `allow-scripts` only and blocks network access with CSP           | implemented, tested    | `CodeLabPlayer` srcdoc, `frontend/e2e/main.spec.js`                                                  |
| Student code is never executed server-side; saves are self-checked progress           | automated              | `backend/tests/labs-api.test.js`, INV-66/67                                                          |
| Lab checks and aggregate lecturer activity                                            | automated              | `backend/tests/labs-api.test.js`                                                                     |
| Practice Lab routes have behavioural authorization coverage                           | automated              | `backend/tests/authorization-matrix.test.js`                                                         |
| FR-30: Business spreadsheet labs with safe formulas, locked cells and tolerant checks | implemented and tested | `backend/src/labs/formula.test.js`, `frontend/src/main.jsx`, migration 022                           |
| FR-30: Business calculator templates and step-by-step working                         | implemented, untested  | `frontend/src/main.jsx`, seed definitions                                                            |
| FR-30: Decision scenarios with validated terminal paths                               | implemented, untested  | scenario config schema and seed definition                                                           |
| Business labs are practice-only and isolated from quiz results                        | automated              | INV-72, `backend/tests/labs-api.test.js`                                                             |
| Business labs are accessible and responsive                                           | implemented, untested  | `frontend/src/main.jsx`, browser coverage pending                                                    |

## Business Lab verification update

- FR-30 spreadsheet formulas, hidden expected values and checks: automated — `backend/src/labs/formula.test.js` 5/5 and `backend/tests/labs-api.test.js` 9/9.
- FR-30 calculators: automated — `backend/src/labs/formula.test.js` known break-even/VAT values and `frontend/src/main.test.jsx` calculator rendering.
- FR-30 scenario validation: automated — `backend/src/labs/scenario.test.js` 2/2.
- Business Lab responsive/accessibility flow: automated — `frontend/e2e/main.spec.js` 6/6 browser projects, 0 axe violations.

## Business Lab gap completion

- Spreadsheet navigation, formula bar, locked cells and hidden check results: automated — `frontend/src/main.test.jsx`, `backend/tests/labs-api.test.js`.
- Scenario meters, branching, saved progress, reflection and restart: automated — `frontend/src/main.test.jsx`, `frontend/e2e/main.spec.js`.
- Lecturer-only authoring and lab lifecycle ownership: automated — `backend/tests/labs-api.test.js`, `backend/tests/authorization-matrix.test.js`, `frontend/e2e/main.spec.js`.

## Manual quiz authoring

| Requirement                                                                                              | Status                 | Evidence                                                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Short-answer scoring, normalization, marks, blank handling and idempotent submit                         | implemented and tested | `backend/tests/api.test.js` — short-answer normalization and blank/length tests; `db/migrations/024_short_answer_invariants.sql` |
| Games exclude non-fixed-option questions while mixed quizzes remain available                            | implemented and tested | game route eligibility queries; `backend/tests/game-availability.test.js`                                                        |
| Student short-answer and code rendering without pre-submit answer leakage                                | implemented and tested | `frontend/src/main.jsx`, `frontend/src/main.test.jsx` — manual quiz taking question types                                        |
| Code answers are shown only in post-submit feedback                                                      | implemented and tested | `backend/src/app.js`, `frontend/src/main.jsx`                                                                                    |
| Lecturer per-question student preview without attempt creation                                           | implemented and tested | `frontend/src/main.jsx`, `frontend/src/main.test.jsx`                                                                            |
| Explicit pre-publish dry run blocks unanswerable/unscorable drafts                                       | implemented and tested | `POST /api/v1/quizzes/:quizId/publish-check`, `backend/tests/api.test.js`, `backend/tests/authorization-matrix.test.js`          |
| Full all-question-type lecturer-to-student browser journey and leaderboard check                         | implemented, untested  | Backend supports all four types; independent end-to-end journey remains outstanding                                              |
| Whole-quiz editor with settings, question cards, add/expand/reorder/duplicate/delete, marks and previews | implemented, tested    | `frontend/src/main.jsx`, `frontend/src/main.test.jsx`                                                                            |

| Requirement                                             | Evidence                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lecturer-only manual creation and ownership             | `backend/src/app.js` manual/question authoring routes; executable authorization matrix entries in `backend/tests/authorization-matrix.test.js` |
| Strict MC, true/false, short-answer and code validation | `backend/src/quizzes/validation.js`; `backend/src/quizzes/validation.test.js`                                                                  |
| Publish checklist and attempted-quiz locking            | `POST /api/v1/quizzes/:quizId/publish`, question mutation routes; authorization matrix                                                         |
| No server-side code execution                           | code fields are persisted/displayed as text; validation tests cover bounded snippets                                                           |

## Study group sessions and calendar

| Requirement                                                              | Status              | Evidence                                                                      |
| ------------------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------- |
| Group session data, bounded future duration and resource scope           | automated           | `025_group_sessions.sql`, `backend/tests/group-sessions-api.test.js`          |
| Leader/co-leader session lifecycle and weekly recurrence                 | automated           | `backend/src/groups/sessions.js`, `backend/tests/group-sessions-api.test.js`  |
| Membership-scoped list, calendar, details, RSVP privacy and cancellation | automated           | `backend/tests/group-sessions-api.test.js`, authorization matrix              |
| Dashboard and group-card next-session surfaces                           | implemented, tested | `frontend/src/study-sessions.jsx`, `frontend/src/study-sessions.test.jsx`     |
| Session-linked “next up” update                                          | automated           | `backend/tests/group-sessions-api.test.js`                                    |
| In-app notifications, mark-read and idempotent 24h/1h reminders          | automated           | `backend/src/groups/sessions.js`, worker, API tests                           |
| Escaped group/session iCalendar downloads                                | automated           | `backend/src/groups/sessions.test.js`, API tests                              |
| Responsive, keyboard-operable month/week calendar and accessible details | automated           | `frontend/src/study-sessions.test.jsx`, `frontend/e2e/study-sessions.spec.js` |

## Study group messaging, announcements and resource sharing

AI generation reliability regression evidence (2026-11-02):
`backend/tests/extract-resource.test.js` verifies actual PDF text extraction;
`backend/tests/ai-source-limits.test.js` verifies bounded source excerpts;
`backend/tests/ai-worker.test.js` verifies count enforcement, old-job retries,
orphan expiry, and cancellation before persistence;
`ai-service/tests/test_openai_compatible_hardening.py` verifies schema-constrained
local requests, remaining deadlines, and request-cap enforcement on fallback;
`frontend/src/main.test.jsx` verifies safe timeout/document-failure guidance.
Live results and coverage limitations are recorded in `docs/AI_PDF_DIAGNOSIS.md`.

| Requirement                                                             | Status    | Evidence                                                                                             |
| ----------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| Member-only chat, lecturer read-only access, replies, edit/delete rules | automated | `backend/src/groups/messaging.js`, `backend/tests/group-messaging-api.test.js`                       |
| Leader announcements, pin limit, moderation reports and mutes           | automated | `backend/tests/group-messaging-api.test.js`, `backend/tests/authorization-matrix.test.js`            |
| Cursor polling, ETag support, escaped XSS text and HTTPS-only links     | automated | `backend/src/groups/messaging.js`, `frontend/src/group-chat.jsx`, `frontend/src/group-chat.test.jsx` |
| Authorized resource/file attachments                                    | automated | `db/migrations/026_group_messaging.sql`, `backend/src/groups/messaging.js`, API tests                |
| Mention, announcement and reply notifications                           | automated | `db/migrations/026_group_messaging.sql`, messaging API tests                                         |
| Responsive chat tab and real two-user announcement flow                 | automated | `frontend/src/group-chat.test.jsx`, `frontend/e2e/study-sessions.spec.js`                            |

# Eight-question local AI follow-up (2026-11-02)

## OpenRouter switch verification (2026-11-02)

The active local environment now selects OpenRouter at
`https://openrouter.ai/api/v1` with `anthropic/claude-haiku-5.5` and no model
fallbacks. The example environment and `docs/OPENROUTER.md` document the setup;
the API key is stored only in the ignored local `.env`.

A live eight-question request through FastAPI `/generate-quiz` using the bundled
database text fixture returned HTTP 200 in 25.55 seconds, with exactly eight
questions. Backend worker validation is checked separately against that output.
This verifies real provider generation through the service; it does not establish
full-PDF coverage, human-reviewed quality or database persistence for this run.
The offline Python suite excluding the four Windows-specific launcher tests
passes 55 tests, including hosted error classification without secret disclosure.
The Windows launcher tests were not run on this Mac.

The earlier Ollama evidence below remains historical.

`ai-service/tests/test_openai_compatible_hardening.py` independently covers eight
validated single-question batches, configured budgets, source-window movement
after rejection, separation of untrusted source text and grounding retry feedback.
Python: 55 passed, zero skipped. INV-11 is retained: invalid or incomplete output
is not persisted. Live evidence in `AI_TEST_REPORT.md` is **not verified for reliable
eight-question generation**: three attempts failed; no quiz saved. Mock browser
evidence must not be substituted for this outstanding real-model requirement.

FR-23 polish evidence (2026-11-02): three added Memory Match API tests prove randomised question sampling, no duplicate answer text on a board, and a distinct-answer six-pair minimum; the games hub accessible-name change is covered by updated `frontend/src/main.test.jsx` queries.

### 2026-11-03 user change request

| Requested behavior                                            | Implementation                                                            | Verification                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Admin adds and deletes users                                  | `admin/accounts.js`, `admin-users.jsx`, migration 029                     | `account-management-api.test.js`, executable authorization matrix, browser admin CRUD                               |
| Students message one another privately                        | `groups/student-network.js`, `student-network.jsx`                        | Participant/role boundaries, text/rate limits, ordered history/read tests; two-context browser messaging            |
| Discover groups and invite students                           | Membership filters, invitations, member roster and leadership handover    | `student-network-api.test.js`; consent, private access, enrolment and handover cases; browser invitation acceptance |
| Lecturer question/answer review without games/labs navigation | Role route catalogue and `quiz-review.jsx`                                | Role routing unit tests, readonly answer rendering, live API/browser review                                         |
| Remove Profile email/MFA panels                               | Shared Profile component                                                  | All-three-role component assertions and navigation sweep; existing MFA login regression retained                    |
| Consistent navigation and wording                             | Browser hash history, role defaults, game/AI messages, group chat refresh | Route round trips, browser refresh/back; chronology/stale-response/dedup regressions                                |
| Mobile PWA                                                    | Manifest, icons, generated service worker, install/update/offline UI      | Browser manifest/icon/offline/cache privacy checks, Chromium/Firefox viewports and iPhone WebKit                    |

Detailed results and deployment evidence: `docs/COLLABORATION_VALIDATION_2026-11-03.md`.

### Memory Match “not enough questions” correction — 2026-11-03

Shared `memory_match/eligibility.js`, minimum configuration and migration 030 align catalogue availability with actual dealing for 2–6 pairs and longer question/answer text. API tests cover 2-, 3- and 5-pair boards, long AI-style text, normalized duplicate answers and no hidden-text exposure. `memory-match-regression.spec.js` plays a real two-question quiz to completion and checks long-text containment, accessibility and mobile overflow. Results: `docs/MEMORY_MATCH_FIX_2026-11-03.md`.

### Owner request: remove MFA — 2026-11-03

Password-only sign-in and production admin access are implemented in `backend/src/app.js` and `backend/src/admin/routes.js`. `frontend/src/main.jsx` and `admin.jsx` no longer offer authenticator/recovery workflows. Migration 031 clears retired authentication material. The replacement `mfa-api.test.js` verifies password-only behavior against legacy credentials, role checks, retirement responses and migration preservation. The executable authorization matrix covers all retired routes; `system-sweep.spec.js` checks all three roles and retains registration email OTP coverage.

### Lecturer join-code visibility after creation — 2026-11-03

The lecturer-owned `/me/modules` catalogue includes saved join codes, displayed in selectable fields with Copy buttons by `Modules` in `frontend/src/main.jsx`. Catalogue API regressions cover repeated reads/search, other-lecturer boundaries and student response privacy. Component regressions cover remounting and successful/denied clipboard access. `module-joincode.spec.js` covers real reload, navigation, logout/login persistence, clipboard copying, mobile containment, accessibility and student presentation.

### Empty student Practice Labs — 2026-11-03

Migration 032 provisions four system starter labs independently of module enrolment. `labAccess` and the `/labs` catalogue preserve module ownership while allowing student access to system content. `PracticeLabs` fetches authorized details before opening players and handles failures/search misses. API tests exercise unenrolled student access, all four kinds, immutable system content, private attempts and server-evaluated spreadsheet feedback. Component tests cover summary/detail loading and recoverable failures. `practice-labs-regression.spec.js` uses the real catalogue, players and attempt APIs to run all four exercises, verify checks/calculations/reflections and restore saved work on mobile and desktop.

### AI status unavailable after transient startup — 2026-11-03

`backend/src/ai-health.js` replaces the one-second status deadline with a bounded serverless-friendly probe, in-flight deduplication and short success caching. Its tests include a real authenticated HTTP response delayed beyond one second, timeout/retry, concurrent calls, expiry and invalid health responses. `ResourceRow` distinguishes missing configuration from a failed status request, offers manual/automatic rechecks and preserves generation after temporary reachability failures. Component regressions and `ai-status-regression.spec.js` verify recovery, configuration gating, accessibility and mobile containment.

### Email domain and profile password regression coverage — 2026-11-03

| Behaviour                                                                                                                                                            | Implementation                                                 | Evidence                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reject nonexistent/unroutable/null-MX registration domains; distinguish temporary DNS failure; accept custom MX and implicit IPv4/IPv6 mail routing                  | `backend/src/validation/email-domain.js`, registration handler | `backend/tests/email-domain.test.js`; `identity-api.test.js` checks inline email errors and no account insertion                                                                                                    |
| Show/hide all three profile passwords; field-specific feedback; confirmation matching; successful clearing and local message placement                               | `frontend/src/main.jsx` ProfilePage                            | `frontend/src/main.test.jsx`; `frontend/e2e/system-sweep.spec.js` registration/profile/sign-in flow and axe check                                                                                                   |
| Correct current password permits change; incorrect current password, weak/identity-containing new password and mismatch do not mutate credentials or revoke sessions | `POST /api/v1/me/password`                                     | `backend/tests/profile-api.test.js` field-key, hash and live-session assertions                                                                                                                                     |
| Password hash/reset flag and other-session revocation commit atomically, preserving the current session                                                              | Locked user row and dedicated transaction client               | `profile-api.test.js` proves old-password rejection, new-password login, reset-flag clearing, session scope and rollback on an injected session-update failure; PGlite does not certify real PostgreSQL concurrency |

Gate verification: 77/77 focused component/unit tests and 204/204 focused API/authorization tests passed (including the additional rollback regression), with zero skips. The registration → email verification → profile password change → new-password sign-in browser flow passed on Chromium mobile/desktop and Firefox desktop, including axe checks. Lint, TypeScript, formatting and the production build passed. A live DNS check also classified the reported `gmail.con` example as invalid. Deployment and later milestones require the current gate approval.

Release approval: the owner explicitly requested committing/pushing these other-chat changes to Rahul’s repository and updating the site. The complete release run passed 279 unit/component and 386 API tests, with zero skips; the end-to-end registration/password flow passed on Chromium mobile/desktop and Firefox mobile. See `docs/EMAIL_PASSWORD_RELEASE_2026-11-03.md` for deployment verification.

### Remove blank admin Moderation section — 2026-11-03

`frontend/src/admin.jsx` removes the Moderation navigation entry, report/action panel and related overview metric. Existing `admin.test.jsx` and the admin navigation case in `system-sweep.spec.js` verify removal and the remaining sections.

Removal validation: all three existing admin component tests and both mobile/desktop admin browser navigation checks passed, including accessibility and overflow checks. Lint, type checking, formatting and production build passed.

Production verification: commit `350f724` was pushed to Rahul’s master branch and deployed to https://eduquest-dun.vercel.app. The live administrator view has exactly Overview, Users, Modules, System and Audit; all five sections loaded successfully, and both Moderation and Open reports were absent.

### Inactive accounts, suspension and session revocation — 2026-11-03

Migration 033 and `backend/src/admin/accounts.js` replace destructive deletion with retained inactive accounts. Admin PATCH actions and transactional session issuance enforce state changes against the locked user; `admin-users.jsx` exposes Deactivate/Activate with clear feedback. `http.js` and the App session watcher return revoked clients to sign-in without treating password-form failures as session expiration.

`account-management-api.test.js` checks identical retained user fields, enrolments, memberships, leadership/visibility, lecturer ownership, searchable inactive status, reactivation, fresh-login rules, revocation, audit events, concurrent administrator actions and rollback. HTTP/component regressions cover client expiry and retained inactive rows. The real two-browser admin scenario exercises Revoke sessions → sign-in → Suspend → Activate → Deactivate → Activate on Chromium mobile/desktop and Firefox mobile. Validation: 668 tests (281 unit/component, 387 API) and all three browser scenarios passed, with no skips. Lint, type checking, formatting and production build passed.

Live release verification: `c31b6a0` is deployed; migration 033 preserved existing user rows. The actual admin buttons passed two-session revocation, suspension, inactivity and reactivation checks. The same identity, credentials and lab draft survived deactivation. QA accounts remain inactive with retained records; owner access was unchanged. Details: `docs/INACTIVE_ACCOUNTS_2026-11-03.md`.

### Upload document audience by student year — 2026-11-03

Migration 034 adds `resources.target_year`; `resource-visibility.js` provides the parameterized year predicate used by catalogue counts/lists, file access, group attachment creation/list/download and session preparation routes. `Resources` in `frontend/src/main.jsx` supplies the year selector, saved-year feedback and list refresh.

Catalogue API regressions exercise Year 1/2/3, hidden search results/counts, direct download denial, ownership/enrolment restrictions, invalid years and old-client defaults. Group tests cover mixed-year attachment/preparation bypass attempts. The component test verifies multipart year submission and refreshed audience labels. `resource-year.spec.js` uploads a Year 2 document through the real UI, verifies its saved audience and checks matching/nonmatching student lists and file access, accessibility and mobile containment. All 673 unit/component/API tests and all three browser scenarios passed across Chromium mobile/desktop and Firefox mobile.

Release verification: `2985a28` is live; migration 034 preserved existing resource records and their audiences. The deployed client bundle, backend health and authenticated mobile lecturer year selector were verified read-only. Production users/documents were not modified for testing. Details: `docs/RESOURCE_YEAR_UPLOADS_2026-11-03.md`.

### Admin signup fields, role selection, OTP and verification delivery — 2026-11-03

`admin-users.jsx` and shared `password-fields.jsx` provide signup-equivalent names/password confirmation and guidance plus the role selector. `admin/accounts.js`, legacy `admin/routes.js` and shared email-domain validation enforce the same policy server-side. Migration 035 and `requireAuth` enforce mandatory verification for new managed accounts without retroactively changing existing access.

`account-management-api.test.js` covers all three roles, inline errors, invalid/temporarily unavailable domains, duplicate/conflicting input, mandatory OTP, incorrect/correct codes, activation bypass denial and delivery outage/resend recovery. `admin-api.test.js` preserves legacy endpoint compatibility; component tests check form requests and password visibility. SMTP tests cover identical-code connection retry, bounded failures, no retry after DATA/authentication and diagnostic redaction. Existing identity API tests cover public signup/resend delivery failures.

Validation: 685 unit/component/API tests (288 + 397), zero failures/skips; nine browser scenarios passed on Chromium mobile/desktop and Firefox mobile, covering public registration/OTP/password change, managed creation/OTP for all roles, and revoke/suspend/deactivate/reactivate retention. Browser font requests are isolated from optional external services. Lint, type checking, formatting and production build passed. Release and live evidence: `docs/ADMIN_SIGNUP_MAIL_2026-11-03.md`.

Release verification: `92cfc0f` is deployed to the canonical site. Migration 035 preserved all 25 original user rows. The live release bundle/PWA manifest/health and an existing lecturer's sign-in, protected access, logout and post-logout denial passed. A fresh public signup was accepted by Gmail SMTP; inbox placement was not claimed. The isolated demo delivery account was retained inactive and its sessions revoked.

### Student sidebar, Quizzes loading errors and code-lab diagnostics — 2026-11-03

`styles.css` contains desktop navigation overflow and preserves mobile wrapping. `Quizzes` exposes module loading/failure/empty states and retry. `lab-validation.js` validates original HTML through the browser validator; `lab-preview.js` installs a separate error/heartbeat/check bridge before student code. `CodeLabPlayer` displays diagnostics, invalidates errored/stale results, clears state on reset and reports draft failures accessibly.

`lab-validation.test.js` covers the screenshot source, missing/misordered tags, duplicate attributes, valid full documents/fragments and optional closing tags. `lab-player.test.jsx` covers forged passing DOM results following malformed source, runtime-error invalidation, reset, save failure and module-request retry/empty state. `student-lab-errors.spec.js` checks short-window sidebar containment, Quizzes request failure/retry, the exact malformed HTML, invalid JavaScript syntax/runtime/promises, unsuccessful completion payloads, correction, edit/reset behavior, save errors, accessibility and overflow. Existing browser coverage verifies all four starter labs and saved-work restoration. Release results are recorded in `docs/STUDENT_LAB_ERRORS_2026-11-03.md`.

Release verification: `66ca17f` is live. All 697 automated tests and six browser scenarios passed, along with lint/type/format/build checks. A real student session confirmed short-window sidebar containment, screenshot-source HTML errors, JavaScript syntax errors and correction to two passed checks. No draft or academic data was saved during live verification. The release bundle, PWA validator cache entry and backend health were verified.
