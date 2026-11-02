# EduQuest on Vercel — 3 November 2026

Public site: **https://eduquest-dun.vercel.app**

The `rahul-521d` team owns the `eduquest` frontend/API project and
`eduquest-ai` Python project. Production uses the free Neon plan and a private
Vercel Blob store. The local development database was not published or reset.

## Runtime

- Vite builds the frontend; `api/index.js` dispatches the Express API with
  secure production cookies and a shared PostgreSQL pool.
- Private Blob storage preserves validated uploads across function instances.
  The normal module/group authorization checks run before blob content is read.
  Development still uses the existing local filesystem behavior.
- Hosted resource uploads are limited to 3 MiB. The frontend checks this before
  sending files; the backend independently enforces the limit. This keeps server
  uploads below Vercel's request limit.
- The Python project runs FastAPI on Python 3.12. Shared-token authentication
  protects both PDF extraction and AI endpoints. OpenRouter uses
  `anthropic/claude-haiku-5.5`; credentials stay in encrypted server environments.
- Creation/status/retry requests start one bounded background worker pass with
  `waitUntil`. Jobs and locks remain in PostgreSQL, so different instances cannot
  claim the same job. Queued retries resume on subsequent authenticated polling;
  there is no continuously running polling daemon in this deployment.
- Hosted in-app session reminders catch up idempotently when notifications are
  requested. Exact continuous 24h/1h delivery requires the standalone reminder
  worker; the hosted version does not promise that timing while nobody is using it.

## Accounts and secrets

Initial admin, lecturer and validation-student credentials are saved only in the ignored local
`.env.vercel-accounts.json` file with owner-only permissions. The production
administrator has MFA enabled; its authenticator setup key, URI and recovery
codes are in that same private file. Import the key into your authenticator before
using the admin account. No public demo passwords were deployed.

`.env.vercel-production` privately preserves the generated service/MFA secrets;
`.env.local` contains integration-managed database credentials. All `.env*` files
and `.vercel` directories are excluded from deployment uploads and Git.

Gmail SMTP is configured on port 465 with implicit TLS. The six-digit
registration screen, live inbox-code entry and replay rejection are verified.
See [EMAIL.md](EMAIL.md) and the [OTP follow-up](REGISTRATION_OTP_2026-11-03.md).

## Updating the site

Deployment is direct from the working tree using Vercel CLI. Automatic GitHub
linking was rejected by Vercel's GitHub connection, so repository pushes alone
do not deploy this site yet. Connect `rahulv0101/IT-project` in the Vercel dashboard
if automatic deployments are wanted.

From the repository root, using your authenticated CLI profile/team:

```sh
vercel deploy --prod --scope rahul-521d
vercel deploy --cwd ai-service --local-config "$PWD/ai-service/vercel.json" --prod --scope rahul-521d
```

Use the absolute Python configuration path: a relative `--local-config` can
resolve the root frontend configuration instead. The Node install explicitly
includes development build tools even with `NODE_ENV=production`.

## Validation

- All 28 migrations applied successfully to the fresh hosted PostgreSQL database.
- 246 JavaScript unit/component tests, 345 database/API tests, and 61 Python tests
  pass, with zero skips. Lint, project type-check and formatting checks pass.
- Private storage tests cover persistence across scratch locations, failure when
  unavailable, and authorization before fetching cloud resource bytes.
- The deployed PDF → private storage → Python extraction → OpenRouter → saved
  eight-question quiz → publish → student submission pipeline passed in 30.61s.
  The student received the expected 13 marks; no correctness fields were exposed
  when the attempt started.
- Hosted student registration with no surname, enrolment, access denial before
  enrolment, authorized download, logout/login, mobile browser login and session
  refresh passed. The AI service rejects requests without its shared token.

All student and lecturer navigation destinations and all six admin sections
passed live mobile accessibility and overflow checks. The 3 MiB upload guard
rejected an oversized file before any upload request was sent. API routing uses
non-capturing rules so platform route captures cannot pollute strict query
validation; notifications, sessions and labs returned successful live responses.
