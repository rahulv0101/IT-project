# EduQuest

Live site: **https://eduquest-dun.vercel.app**. See
[deployment notes](docs/VERCEL_DEPLOYMENT.md) for hosting, accounts and validation.

New contributors should start with [`docs/CODE_MAP.md`](docs/CODE_MAP.md). It
maps every major feature to its frontend, backend, database, worker, and test
files; the largest source files also contain matching section banners.

Quiz generation uses OpenRouter with Claude Haiku 5.5. See
[`docs/OPENROUTER.md`](docs/OPENROUTER.md) for credentials, setup and verification.

Verification email supports private development files or configured SMTP. See
[`docs/EMAIL.md`](docs/EMAIL.md) for setup and delivery limits.

## Local development

After installing dependencies and the Python requirements, `npm start` runs
token setup, database startup, migrations, demo seeding and the app stack on
macOS, Linux or Windows. `npm start -- --dry-run` lists these steps without
starting them. Python is resolved from `PYTHON_EXECUTABLE`, `.venv`, or PATH.
`npm run test:python` runs the complete offline Python suite through that same
interpreter. See `docs/OPENROUTER.md` for virtual-environment setup.

Requirements: Node.js 22+ and Python 3.11+. PostgreSQL-compatible PGlite runs locally through the normal `pg` driver; no system database installation is required.

```powershell
npm install
npm run db:start
npm run db:migrate
npm run seed
npm test
npm run test:backup
npm run test:e2e
```

`db:start` creates `.pgdata/dev` and `.pgdata/test`, writes `.env`, starts the two local socket servers, and waits for both to accept connections. `npm run db:stop` stops them and `npm run db:status` checks them.

Run the API, configured AI service, and React frontend together with:

```powershell
npm run dev
```

`npm test` starts a fresh, isolated PGlite instance in `.pgdata/test-suite`, waits for a successful `select 1`, reapplies all migrations, runs database test files serially, and stops the instance after the gate. It never uses the dev data directory. Pure unit tests still run in parallel. A skipped test exits non-zero and can never count as a passing gate.

### PGlite test troubleshooting

`read ECONNRESET`, `Connection terminated unexpectedly`, or “did not accept connections” means the socket server stopped accepting queries; it is not an application assertion failure. Retry `npm test` first: the test runner owns a fresh isolated instance and normally recovers automatically. Its termination log is `.pgdata/logs/test-suite.log` and contains no connection secrets.

For a problem with the long-lived local development servers, restart them:

```powershell
npm run db:stop
npm run db:start
npm run db:status
```

If `db:status` still reports that 5432 or 5433 is unavailable, inspect `.pglite-dev.pid` and `.pglite-test.pid` and stop only those recorded Node processes before running `npm run db:start` again. Do not delete `.pgdata/dev`; it contains local development data. The automated test runner may safely recreate only `.pgdata/test-suite`.

### Dev tooling safety

Vite's development and preview servers bind to `127.0.0.1` in `frontend/vite.config.js`; the npm scripts do not expose a host flag. API CORS accepts only `http://localhost:5173`, and Vitest UI is not enabled. Keep these tools local and do not expose them through a tunnel.

Audit Python dependencies with `pip-audit -r ai-service/requirements.txt`.

Install the Playwright browsers before the browser gate:

```powershell
npx playwright install chromium firefox
npm run test:e2e
```

The browser suite covers 390px mobile, 768px tablet and 1280px desktop in both Chromium and Firefox, including an axe scan of the authentication screen.

Browser tests use a fresh isolated PGlite database in `.pgdata/e2e-suite` on port 55436 and a separate local app stack on ports 4391, 8391 and 5391. They never use the development database. If a previous run left a local test process behind, stop only the process using those test ports and rerun `npm run test:e2e`.

The quiz list is paginated to 20 items by default and supports title search. Repeated demo data is not expected: `npm run seed` is idempotent. To intentionally reload only the demo records, run `npm run seed:reset` and type `RESET DEMO DATA`; it refuses to run in production.

To reset the test database manually:

```powershell
npm run db:test:reset
```

This drops and recreates only the `public` schema in the configured test database, then runs all migrations. Do not point `TEST_DATABASE_URL` at a production database.

The database uses UUIDs, server-side opaque sessions, persistent AI jobs, module join codes, topic-linked questions, and database-enforced academic invariants. See `docs/DECISIONS.md` and `docs/INVARIANTS.md`.

Create and restore an application-level JSON backup with `npm run db:backup -- backups/eduquest.json` and `npm run db:restore -- backups/eduquest.json`. Restore is explicit and should target only a known EduQuest database. `npm run test:backup` verifies a round trip against `TEST_DATABASE_URL`.

For full row-locking and concurrency evidence, provide a real PostgreSQL URL through `REAL_TEST_DATABASE_URL` and run `npm run test:db:real`. PGlite intentionally cannot certify that part of the gate.

The seed prints the demo credentials. Defaults are:

- Lecturer: `demo-lecturer@example.com` / `EduQuestDemo123!`
- Students: `demo-student-1@example.com` through `demo-student-5@example.com` / `EduQuestDemo123!`
- Module: `DEMO101`, JoinCode `DEMOJOIN2026`
