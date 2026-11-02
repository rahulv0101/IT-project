# Verification run — 2026-10-27

For current evidence, read [the 2 November 2026 system sweep](VALIDATION_2026-11-02.md).
The records below are historical.

Variable names were checked without printing values. Present names: `DATABASE_URL`, `TEST_DATABASE_URL`, `PGLITE_DEV_PORT`, `PGLITE_TEST_PORT`. Missing names: `REAL_TEST_DATABASE_URL`, `ANTHROPIC_API_KEY`. Chromium and Firefox Playwright browsers are installed.

| Step                                               | Result                            | Evidence                                                                                                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Prerequisites and repository checks             | passed                            | Environment-name check, Playwright 1.64.0, Chromium and Firefox detected                                                                                                                                                                              |
| 2. Local stack, migrations, seed and reset         | passed                            | `db:status`, setup check, two idempotent `db:migrate` runs, `seed`, and `db:test:reset`                                                                                                                                                               |
| 3. Real PostgreSQL/concurrency verification        | blocked: `REAL_TEST_DATABASE_URL` | Set `REAL_TEST_DATABASE_URL` to a disposable real PostgreSQL test database, then run `npm run test:db:real`. Do not use the PGlite URLs.                                                                                                              |
| 4. Real Anthropic verification                     | blocked: `ANTHROPIC_API_KEY`      | Set `ANTHROPIC_API_KEY`, then run `npm run test:ai:real` after the Anthropic provider fixture is configured. The offline MockProvider tests remain runnable.                                                                                          |
| 5. Built-game student play-throughs                | passed for built games            | Infected: `backend/tests/infected-api.test.js`, frontend component tests, and Playwright flow. Island Escape: `backend/tests/island-escape-api.test.js`, frontend component tests, and Playwright flow. Manual scripts are in `docs/MANUAL_TESTS.md`. |
| 6. Automated quality and full offline suite        | passed                            | 177 JavaScript tests, 4 Python tests, zero skipped; lint, Prettier, TypeScript, and frontend production build passed.                                                                                                                                 |
| 7. Browser accessibility and viewport verification | passed                            | 24 Playwright tests, Chromium/Firefox at 390/768/1280, including axe checks and Infected/Island flows                                                                                                                                                 |
| 8. Backup, traceability and delivery review        | passed with caveat                | JSON backup round-trip and documentation are present; native PostgreSQL dump evidence remains dependent on real PostgreSQL/client binaries.                                                                                                           |

## Built games

- Infected — built and tested. Evidence: 14 engine tests, 15 API tests, DB invariants, component tests, and Playwright/axe flow.
- Island Escape — built and tested. Evidence: 14 engine/property tests, 11 API tests, DB invariants, component tests, and Playwright/axe flow.

## Not verified

- Real PostgreSQL row-locking/concurrency: requires `REAL_TEST_DATABASE_URL` and `npm run test:db:real`.
- Anthropic live-provider behavior: requires `ANTHROPIC_API_KEY` and `npm run test:ai:real`.
- Native PostgreSQL backup/restore: requires `pg_dump`/`pg_restore` against real PostgreSQL.
- Timer Trivia solo mode is built and covered by engine, API, component, authorization, and six-project Playwright/axe gates. Multiplayer remains unverified.
- Multiplayer rooms and all multiplayer modes: not built and explicitly out of scope.

## Verdict

Ready with caveats: the local PGlite-backed application and the two built solo games pass the offline, API, database, frontend, accessibility, and browser gates. It is not ready for a claim of complete production verification until real PostgreSQL concurrency, live Anthropic behavior, and native dump/restore are run.

## Follow-up verification — 2026-10-27

The project `.env` was rechecked by variable name only. `REAL_TEST_DATABASE_URL` and `ANTHROPIC_API_KEY` were not present in the file or process environment during this run. Chromium and Firefox remain installed.

### Step 6 security spot checks

| Check                                        | Result | Evidence                                                                          |
| -------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| Unauthenticated protected access returns 401 | passed | `backend/tests/api.test.js` — `rejects unauthenticated protected access with 401` |
| Wrong role returns 403                       | passed | `backend/tests/api.test.js` — `rejects wrong-role module creation with 403`       |
| Profanity generic rejection                  | passed | `backend/tests/api.test.js`, `backend/tests/profanity.test.js`                    |
| Logout revokes session                       | passed | `backend/tests/api.test.js` — `revokes the server-side session on logout`         |
| Invalid login hides account state            | passed | `backend/tests/api.test.js` — invalid-login test                                  |
| Spoofed upload bytes rejected                | passed | `backend/tests/api.test.js` — magic-byte test                                     |
| Forged score/cross-question option rejected  | passed | `backend/tests/api.test.js` — forged-score test                                   |
| Correctness hidden before submission         | passed | API and browser disclosure tests                                                  |

### Blocked follow-up steps

- Step 3: blocked. `node -r dotenv/config scripts/test-real-db.mjs` failed with `REAL_TEST_DATABASE_URL is required for real PostgreSQL verification`. Add `REAL_TEST_DATABASE_URL` to `.env`, then run `npm run test:db:real`.
- Step 4: blocked. This checkout contains no `AnthropicProvider` and no `npm run test:ai:real` script. Add `ANTHROPIC_API_KEY` to `.env` and implement/configure that provider and fixture runner before live-AI verification.
- Step 5 real-AI journey/screenshots: blocked by Step 4; no screenshots were generated.
- Step 7 native backup: blocked because `pg_dump` and `pg_restore` were not found on PATH.

Updated verdict: ready with caveats. Offline verification and security spot checks pass, but real PostgreSQL concurrency, live Anthropic verification, real-AI screenshots, and native PostgreSQL backup/restore remain unverified.

## Full verification run — 2026-10-27

### Environment

`.env` exists at the project root and `git check-ignore .env` passed. The following names were missing from `.env`: `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, and `REAL_TEST_DATABASE_URL`. No values were printed. `.env.txt` was not present.

### Offline results

| Area                |       Ran | Passed | Skipped | Result |
| ------------------- | --------: | -----: | ------: | ------ |
| JavaScript/Vitest   |       177 |    177 |       0 | passed |
| Python/AI           |        19 |     19 |       0 | passed |
| Playwright/axe      |        24 |     24 |       0 | passed |
| Lint                | 1 command |      1 |       0 | passed |
| Format              | 1 command |      1 |       0 | passed |
| Type-check          | 1 command |      1 |       0 | passed |
| Frontend build      | 1 command |      1 |       0 | passed |
| DB reset/invariants |        11 |     11 |       0 | passed |

### Blocked and unverified

- Step 3: blocked: `REAL_TEST_DATABASE_URL`. Add it to `.env` and run `npm run test:db:real`; no concurrency test names can honestly be reported yet.
- Step 4: blocked: `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. Add the four provider variables and rerun the real-AI path. No live request was attempted.
- Step 5: the existing 24 browser tests passed using mocked routes, but the requested full lecturer/student generation journey and screenshots were not run. No screenshot evidence is claimed.
- Native `pg_dump`/`pg_restore`: unavailable because neither executable was found. JSON backup fallback passed after restarting the PGlite processes; round-trip reported 8 migrations.
- `npm audit --audit-level=high`: 12 vulnerabilities reported: 5 moderate, 5 high, 2 critical. No forced dependency upgrade was applied.
- Timer Trivia and multiplayer remain unverified. Boss Battle and Pixel Car Racer solo modes have since passed their documented gates.

### Bug list

- PGlite connection terminated during the first backup attempt after browser verification; restarting the local PGlite processes resolved it. No application code change was made, so there is no bug-fix commit.

### Verdict

Ready with caveats: all credential-free suites passed with zero skips, but real PostgreSQL concurrency, live AI, the requested end-to-end generated-quiz journey, native backup, and the audit vulnerabilities remain unverified.

## npm audit remediation — 2026-10-27

| Stage                                          | Moderate | High | Critical | Total |
| ---------------------------------------------- | -------: | ---: | -------: | ----: |
| Before fixes                                   |        5 |    5 |        2 |    12 |
| After non-breaking `npm audit fix` (`544bd3d`) |        3 |    1 |        2 |     6 |
| Final                                          |        3 |    1 |        2 |     6 |

The six remaining findings are dev-only Vitest/Vite tooling issues. A deliberate major upgrade attempt was reverted because Vitest 5 broke `describe.sequential` and the existing authorization-matrix executable-assertion guard. No test was changed or weakened. See `docs/DECISIONS.md` for package-by-package advisory details and mitigations. `pip-audit` was unavailable (`pip-audit` is not installed), so Python audit remains not verified.

Final quality rerun after the compatible dependency state: 177 JavaScript tests passed, 19 Python tests passed, 24 Playwright/axe tests passed, zero skipped; lint, formatting, type-check, frontend build, and DB reset/invariants passed.

## Google AI Studio smoke check — 2026-10-27

- `.env`: exists; `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` are missing. No values were printed.
- `.env` ignore check: passed; `git check-ignore .env` returned `.env`.
- Provider implementation: present. `OpenAICompatibleProvider` validates the required variables, accepts HTTPS (and localhost HTTP), falls back from rejected JSON mode to plain JSON prompting, strips code fences, validates the strict Pydantic schema, handles 429/Retry-After, applies request delays and caps, and keeps secrets out of logs/errors.
- Package: `openai` is declared in `ai-service/requirements.txt` and installed (`2.30.0`).
- Offline checks: lint passed; type-check passed; Python suite passed with 19 tests and 0 skips.
- Live smoke: not run because the four Google configuration variables are missing. No network request was attempted.

Verdict: not working yet for Google AI Studio because configuration is absent. Single next action: add `AI_PROVIDER=openai_compatible`, `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`, `AI_API_KEY=<Google key>`, and `AI_MODEL=<current Gemini model>` to `.env`, then rerun the smoke check.

# Verification run

Generated: 2026-10-27T21:15:54.650Z

| Check              | Result                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| lint               | failed (process)                                                              |
| format             | failed (process)                                                              |
| type-check         | failed (process)                                                              |
| build              | failed (process)                                                              |
| JavaScript suite   | failed (process)                                                              |
| Python suite       | failed (1)                                                                    |
| Playwright and axe | failed (process)                                                              |
| real PostgreSQL    | blocked: REAL_TEST_DATABASE_URL — add it to .env, then run npm run verify:all |
| real AI            | blocked: ANTHROPIC_API_KEY — add it to .env, then run npm run verify:all      |

## Not verified

- Real PostgreSQL and live Anthropic checks are blocked when their variable names are missing.
- Native backup uses pg_dump/pg_restore when available; otherwise use the JSON fallback.

## Verdict

Not ready: one or more runnable checks failed.

## 2026-10-28 — Dependency and dev-tooling safety verification

- `pip-audit -r ai-service/requirements.txt`: 12 records remain after the compatible FastAPI/Starlette update; 10 records are Starlette runtime advisories with fixed versions outside the supported dependency line, and 2 records are the pytest 8.3.4 development-only advisory fixed by pytest 9.0.3. No compatible non-breaking fix was available for the remaining records.
- Python suite: 19 passed, 0 skipped.
- JavaScript suite: 177 passed, 0 skipped.
- Lint, format check, type-check, and frontend build: passed.
- Browser/axe suite: final full run passed 24/24, 0 skipped, across Chromium and Firefox at 390, 768, and 1280px. The earlier connection-refused run was transient; the targeted rerun also passed 8/8.
- Vite development and preview hosts are configured as `127.0.0.1`; npm scripts contain no host flag, no `0.0.0.0`, and no Vitest UI configuration. API CORS is fixed to `http://localhost:5173`.
- The root `npm run build` command was added because it was missing; it passed.

### AI exposure check

- `ai-service/run.py` defaults to `127.0.0.1`; public binding is rejected unless `AI_ALLOW_PUBLIC_BIND=true` is explicit.
- `backend/scripts/ai-worker.js` is the only direct AI-service caller. Frontend source contains no AI-service URL or direct generation call.
- Exposure tests: 25 Python tests passed, including missing-token 401, wrong-token 401, correct-token 200, oversized-body 413, secret-safe response/log checks, and development OpenAPI availability. Production docs disablement is configured by `NODE_ENV`.
- `AI_SERVICE_TOKEN` is generated by `npm run db:setup-check` when absent; only the variable name/presence is reported.
- Recheck command after a dependency update: `pip-audit -r ai-service/requirements.txt`, then `python -m pytest ai-service -q` and the full project gates.

# Verification run

Generated: 2026-10-27T21:16:03.803Z

| Check              | Result                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| lint               | failed (process)                                                              |
| format             | failed (process)                                                              |
| type-check         | failed (process)                                                              |
| build              | failed (process)                                                              |
| JavaScript suite   | failed (process)                                                              |
| Python suite       | passed                                                                        |
| Playwright and axe | failed (process)                                                              |
| real PostgreSQL    | blocked: REAL_TEST_DATABASE_URL — add it to .env, then run npm run verify:all |
| real AI            | blocked: ANTHROPIC_API_KEY — add it to .env, then run npm run verify:all      |

## Not verified

- Real PostgreSQL and live Anthropic checks are blocked when their variable names are missing.
- Native backup uses pg_dump/pg_restore when available; otherwise use the JSON fallback.

## Verdict

Not ready: one or more runnable checks failed.

# Verification run

Generated: 2026-10-27T21:16:09.017Z

| Check              | Result                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| lint               | failed (process)                                                              |
| format             | failed (process)                                                              |
| type-check         | failed (process)                                                              |
| build              | failed (process)                                                              |
| JavaScript suite   | failed (process)                                                              |
| Python suite       | passed                                                                        |
| Playwright and axe | failed (process)                                                              |
| real PostgreSQL    | blocked: REAL_TEST_DATABASE_URL — add it to .env, then run npm run verify:all |
| real AI            | blocked: ANTHROPIC_API_KEY — add it to .env, then run npm run verify:all      |

## Not verified

- Real PostgreSQL and live Anthropic checks are blocked when their variable names are missing.
- Native backup uses pg_dump/pg_restore when available; otherwise use the JSON fallback.

## Verdict

Not ready: one or more runnable checks failed.

# Verification run

Generated: 2026-10-27T21:16:25.366Z

| Check              | Result                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| lint               | failed (process)                                                              |
| format             | failed (process)                                                              |
| type-check         | failed (process)                                                              |
| build              | failed (process)                                                              |
| JavaScript suite   | failed (process)                                                              |
| Python suite       | passed                                                                        |
| Playwright and axe | failed (process)                                                              |
| real PostgreSQL    | blocked: REAL_TEST_DATABASE_URL — add it to .env, then run npm run verify:all |
| real AI            | blocked: ANTHROPIC_API_KEY — add it to .env, then run npm run verify:all      |

## Not verified

- Real PostgreSQL and live Anthropic checks are blocked when their variable names are missing.
- Native backup uses pg_dump/pg_restore when available; otherwise use the JSON fallback.

## Verdict

Not ready: one or more runnable checks failed.

# Verification run

Generated: 2026-10-27T21:18:44.658Z

| Check              | Result                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| lint               | passed                                                                        |
| format             | failed (1)                                                                    |
| type-check         | passed                                                                        |
| build              | passed                                                                        |
| JavaScript suite   | passed                                                                        |
| Python suite       | passed                                                                        |
| Playwright and axe | passed                                                                        |
| real PostgreSQL    | blocked: REAL_TEST_DATABASE_URL — add it to .env, then run npm run verify:all |
| real AI            | blocked: ANTHROPIC_API_KEY — add it to .env, then run npm run verify:all      |

## Not verified

- Real PostgreSQL and live Anthropic checks are blocked when their variable names are missing.
- Native backup uses pg_dump/pg_restore when available; otherwise use the JSON fallback.

## Verdict

Not ready: one or more runnable checks failed.
