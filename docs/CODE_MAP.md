# EduQuest code map

This guide is the quickest way to find a feature. The comments inside the main
backend and frontend files use the same feature names as this document.

## How a request moves through the system

```text
Browser (frontend/src)
  -> /api/v1 request
Backend (backend/src)
  -> validation, session, role and ownership checks
  -> parameterised SQL through backend/db.js
Database (db/migrations)

AI quiz request only:
Backend -> ai_generation_jobs -> ai-worker.js
  -> shared-secret request to ai-service/app.py
  -> strict validation -> transactional quiz persistence
```

## Root and infrastructure

| Area                  | Location                                  | Purpose                                                                                           |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Commands              | `package.json`                            | Install, run, migrate, seed, test, backup, and verification commands.                             |
| One-click launcher    | `Start-EduQuest.ps1`, `scripts/run-*.ps1` | Starts the database, migrations, seed, backend, AI service, workers, and stable frontend preview. |
| Local database server | `scripts/pglite-server.mjs`               | Runs PGlite behind the normal PostgreSQL `pg` protocol.                                           |
| Database changes      | `db/migrations/`                          | Ordered schema and invariant history; never edit an applied migration.                            |
| Demo records          | `backend/scripts/seed.js`                 | Idempotent lecturer, student, module, quiz, game, and lab examples.                               |
| Product decisions     | `docs/DECISIONS.md`                       | Approved defaults, trade-offs, and known limitations.                                             |
| Requirement evidence  | `docs/TRACEABILITY.md`, `docs/STATUS.md`  | Requirement-to-code and requirement-to-test mapping.                                              |

## Backend

| Feature                                      | Main implementation                                                              | Tests                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| HTTP setup, middleware, central errors       | `backend/src/app.js`                                                             | `backend/tests/api.test.js`                                      |
| Registration, login, sessions, profiles, MFA | `backend/src/app.js`, `backend/src/validation/identity.js`, `backend/src/mfa.js` | `identity-api.test.js`, `profile-api.test.js`, `mfa-api.test.js` |
| Admin controls and audit trail               | `backend/src/admin/routes.js`                                                    | `admin-api.test.js`, `authorization-matrix.test.js`              |
| Modules and resources                        | `backend/src/app.js`                                                             | `module-resource-catalogue-api.test.js`                          |
| Study groups and recommendations             | `backend/src/groups/recommendations.js`                                          | `study-groups-api.test.js`                                       |
| Group sessions and calendar                  | `backend/src/groups/sessions.js` and session routes in `app.js`                  | `group-sessions-api.test.js`                                     |
| Group chat and moderation                    | `backend/src/groups/messaging.js` and messaging routes in `app.js`               | `group-messaging-api.test.js`                                    |
| Quiz authoring and validation                | `backend/src/quizzes/validation.js`, quiz section of `app.js`                    | `api.test.js`, `validation.test.js`                              |
| Attempts and scoring                         | attempt section of `backend/src/app.js`                                          | `api.test.js`                                                    |
| Leaderboard and analytics                    | reporting section of `backend/src/app.js`                                        | `api.test.js`                                                    |
| Profanity boundary                           | `backend/src/profanity/`                                                         | `profanity.test.js` and API tests                                |
| Practice Labs                                | `backend/src/labs/`, labs section of `app.js`                                    | `labs-api.test.js`, formula/scenario tests                       |
| Route authorization inventory                | `backend/src/authorization-matrix.js`                                            | `authorization-matrix.test.js`                                   |

## Games

Every game follows the same layout: `config.js` owns tunable numbers,
`engine.js` is pure game logic, `state.js` validates stored state, and
`routes.js` enforces access and transactional persistence. Never put game rules
in the React screen or SQL route handler.

| Game            | Backend folder                     | Frontend component                        | Integration test            |
| --------------- | ---------------------------------- | ----------------------------------------- | --------------------------- |
| Infected        | `backend/src/games/infected/`      | `InfectedGame` in `frontend/src/main.jsx` | `infected-api.test.js`      |
| Island Escape   | `backend/src/games/island_escape/` | `IslandEscapeGame`                        | `island-escape-api.test.js` |
| Memory Match    | `backend/src/games/memory_match/`  | `MemoryMatchGame`                         | `memory-match-api.test.js`  |
| Boss Battle     | `backend/src/games/boss_battle/`   | `BossBattleGame`                          | `boss-battle-api.test.js`   |
| Pixel Car Racer | `backend/src/games/pixel_racer/`   | `PixelRacerGame`                          | `pixel-racer-api.test.js`   |
| Timer Trivia    | `backend/src/games/timer_trivia/`  | `TimerTriviaGame`                         | `timer-trivia-api.test.js`  |

Shared game access and availability live in `backend/src/games/access.js` and
`availability.js`. Generic versioned state persistence lives in
`play-state.js`. Game scores are practice-only and never feed the leaderboard.

## Frontend

| Screen or concern                        | Location                                                       |
| ---------------------------------------- | -------------------------------------------------------------- |
| App shell, role navigation, most screens | `frontend/src/main.jsx` (section banners identify each screen) |
| Administrator control centre             | `frontend/src/admin.jsx`                                       |
| Study-session calendar and notifications | `frontend/src/study-sessions.jsx`                              |
| Group chat and moderation                | `frontend/src/group-chat.jsx`                                  |
| Safe spreadsheet evaluator               | `frontend/src/spreadsheet.js`                                  |
| Shared visual system                     | `frontend/src/styles.css`, `docs/DESIGN.md`                    |
| Component tests                          | `frontend/src/*.test.jsx`                                      |
| Browser and axe journeys                 | `frontend/e2e/`                                                |

## AI service

| Area                                  | Location                         | Purpose                                                                              |
| ------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| Provider interface and strict schemas | `ai-service/app.py`              | Mock, Anthropic, OpenAI, and OpenAI-compatible providers return one validated shape. |
| Environment parsing                   | `ai-service/config.py`           | Cleans quotes, spaces, CRLF, and BOM safely.                                         |
| Backend worker                        | `backend/scripts/ai-worker.js`   | Claims jobs, calls AI, validates again, and persists transactionally.                |
| Offline provider tests                | `ai-service/test_app.py`         | No normal test contacts a paid or remote provider.                                   |
| Manual live check                     | `ai-service/tools/live_check.py` | Bounded real-model verification and quality report.                                  |

## Test suites

| Command                          | Coverage                                                                    |
| -------------------------------- | --------------------------------------------------------------------------- |
| `npm test`                       | Unit/component tests, then isolated database/API/invariant tests.           |
| `python -m pytest ai-service -q` | AI service, provider, validation, and secret-safety tests.                  |
| `npm run test:e2e`               | Chromium and Firefox at mobile, tablet, and desktop sizes, including axe.   |
| `npm run test:db:real`           | PostgreSQL concurrency checks using `REAL_TEST_DATABASE_URL`.               |
| `npm run test:ai:real`           | Explicit real-provider quality run; never part of the normal offline suite. |

## Security boundaries worth knowing

- `requireAuth` and role middleware in `backend/src/app.js` protect API routes;
  hiding a frontend button is never treated as authorization.
- Correct answers and accepted short answers stay server-side until the allowed
  feedback stage.
- Uploads are served through authorized routes, not directly from the web root.
- The browser never contacts the AI service; only the backend worker does, using
  `AI_SERVICE_TOKEN`.
- SQL values are parameterised, and multi-row scoring/game writes use database
  transactions and row locks.

## Student collaboration, user removal and mobile installation

- `backend/src/groups/student-network.js` implements the student directory, two-person conversations, invitation responses, group member rosters and primary leadership handover. `backend/tests/student-network-api.test.js` checks access boundaries and persistence; `helpers/network-cases.js` covers every route in the authorization matrix.
- `backend/src/admin/accounts.js` implements administrator-created users and audited removal/anonymisation. `account-management-api.test.js` covers all three roles, session revocation, lecturer reassignment, leadership succession and competing administrator actions.
- `frontend/src/student-network.jsx` contains Messages, invitations, the invite picker and group members. `admin-users.jsx` contains user creation, search, account actions and deletion confirmation. `quiz-review.jsx` displays the lecturer's questions and correct answers.
- `frontend/src/navigation.js` owns role navigation and hash-route parsing/history. `http.js` provides readable network failure messages.
- `frontend/src/pwa.jsx`, `frontend/public/manifest.webmanifest` and `frontend/pwa/sw.template.js` implement install/update/offline behavior. `scripts/build-pwa.mjs` versions the public asset cache after Vite builds. Private API traffic is excluded.
- `frontend/e2e/collaboration.spec.js` checks real two-student interaction, admin CRUD, lecturer review and PWA behavior; `collaboration.test.jsx`, `navigation.test.js` and `pwa.test.jsx` cover component and routing behavior.
