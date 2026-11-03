# Decisions

## 2026-11-03 — Registration branch OTP follow-up

- Restore the requested registration/OTP experience rather than retaining the
  earlier link-only UI. The public form requires a surname and shows password
  requirements directly beneath the password. Legacy API name compatibility is
  retained. The verification step survives refresh; MFA login remains intact.
- Bind six-digit codes to the authenticated user, with a nonce, keyed HMAC,
  ten-minute expiry, five-guess limit and sixty-second resend cooldown in the DB.
  Serialize consumption transactionally; legacy links and codes invalidate each
  other under the same lock order.
- Configure Gmail SMTP with implicit TLS using private server credentials.
  Actual inbox-code entry, refresh and replay rejection passed on the public site.
  Keep all offline suites on file/mock delivery.
- See `REGISTRATION_OTP_2026-11-03.md` for current behavior and validation.

## 2026-11-03 — Vercel deployment

- Deploy the existing Vite/Express frontend/API and the authenticated Python AI
  service as two Vercel projects owned by Rahul. Use a fresh free Neon database;
  do not expose the local development dataset or public demo passwords.
- Use private Blob storage with existing resource/group authorization, a 3 MiB
  hosted upload limit, and local filesystem behavior outside the cloud.
- Retain persistent PostgreSQL job claims and bounded `waitUntil` work triggered
  by generation/status/retry requests. Catch up in-app reminders on notification
  reads rather than keeping a free database permanently awake with polling.
- Enable production admin MFA and store bootstrap credentials/recovery material
  only in ignored private files. SMTP delivery remains unconfigured.
- Keep hosting secrets encrypted server-side. Document direct deployment and
  validation in `VERCEL_DEPLOYMENT.md`; automatic GitHub linking is not connected.

## 2026-11-03 — Compatible registration branch integration

- Merge `Register-page-fixed` with current master as the compatibility baseline.
  Retain optional surnames, opaque verification links, MFA, OpenRouter defaults,
  portable launchers and existing system validation repairs.
- Adopt independent password visibility controls and live requirement feedback.
- Adapt SMTP to the existing link flow. Require TLS, preserve password bytes,
  use private development mail files and prohibit production file fallback.
- Resend requires a current session, uses the server's account/pending address,
  rejects extra request fields and shares the authentication rate limiter.
  Registration delivery failure leaves the account/session usable for retry.
- Exclude the older global six-digit email-code lookup and required surname.
  See `BRANCH_MERGE_REVIEW_2026-11-03.md` for branch inventory and evidence.

## 2026-11-02 — System validation and account-flow repairs

- Treat a blank optional registration surname as absent. Return field validation
  messages alongside the standard safe API error and show a global form alert.
- Complete browser email verification, MFA enrolment/confirmation, MFA challenge
  login and recovery-code actions. Profile loading failures are visible, and the
  dirty flag compares equivalent form snapshots.
- Keep hosted AI validation strict. Prevent duplicate in-flight UI generation
  requests and reject unsupported Office generation before creating a paid job.
  Office files remain available as downloadable teaching resources.
- Use a project Python 3.11+ interpreter consistently. Portable launchers resolve
  the checkout rather than a specific user's Windows desktop. Unit test workers
  are bounded; normal JavaScript runs allocate an independent database port.
- Enable actual ESLint JavaScript/React rules. Browser sweeps cover registration,
  verification, MFA and every student/lecturer/admin navigation destination.
- JSON backup uses one repeatable-read snapshot. Restore validates table/column
  metadata, orders parent records before children, binds values by column name,
  serializes JSON explicitly and preserves user-trigger states transactionally.
  Foreign keys remain active; deferred turn/card references are checked at commit.
  Backup validation uses seeded data, compares all 44 tables, exercises rollback
  on an invalid reference, and checks repeated-seed safety.
- Validate the same API suite on disposable PostgreSQL as well as PGlite. The
  real-database gate uses a multi-connection pool and adds simultaneous attempt,
  submission and conflicting-option tests; it rejects the configured development
  URL. Native and JSON restore checks were exercised on PostgreSQL 16.15.
- Replace the misleading offline `test:ai:real` fixture invocation with a bounded,
  explicit paid PDF-upload-to-generation-to-publish-to-student-submit check on a
  temporary database. This does not establish full coverage of arbitrary PDFs.

## 2026-11-02 — OpenRouter quiz generation

- Switch the local environment and example configuration to OpenRouter's
  OpenAI-compatible endpoint with `anthropic/claude-haiku-5.5`, as requested.
- Keep credentials only in the ignored local `.env`. No model fallbacks are
  configured; existing validation and transactional persistence stay mandatory.
- Use five-question batches with 120-second provider, 150-second HTTP and
  180-second worker budgets. Hosted source sampling remains 60,000 characters.
- Make the AI checker provider-neutral and distinguish hosted authentication,
  credit, connection and model errors from legacy local Ollama failures.
- Keep historical Ollama instructions as optional documentation; no local
  model service is required for the active configuration.

## 2026-10-09 — Milestone 1 foundation

- Use UUID primary keys throughout; `group_members` uses a composite `(group_id, student_id)` primary key.
- Use opaque random session tokens stored only as hashes in `sessions`; cookies are httpOnly and JWTs are not used. Logout revokes the server-side session.
- Add `ai_generation_jobs` for persistent asynchronous generation and status polling.
- Modules use a random unique `join_code` for student self-enrolment; `module_code` remains an academic identifier only.
- Add quiz `title` and optional `closes_at`; the service rejects starts and submissions after the close time with HTTP 409.
- Mini-scope is a short per-topic revision summary from one resource. Analysis is lecturer-facing and receives only aggregate topic statistics; no student names, emails, or IDs are sent to AI.
- The original catalog used `flashcards`, `speed_round`, and `match_pairs`; the 2026-10-27 Stage 0 decision below supersedes the latter two. Games remain practice-only and reuse quiz questions. Competitive games are gated until the student's scored attempt is complete; lecturers always have access.
- Game mechanics remain disabled until their named feature stage passes. Adding or enabling a catalogued type is a data change. The implemented rule is: lecturers can access games, while students can access games for a competitive quiz only after their own scored attempt is completed. The earlier database test name suggesting that all competitive games were forbidden was corrected; the service policy is the authoritative access boundary.
- Future game modules must implement `{ key, buildFromQuiz(quiz), validate(gameData), scoring: 'none' | 'practice' }`. No game score is eligible for leaderboard records without explicit future approval.
- Unanswered questions score zero and do not create `student_answers` rows. Results report the unanswered count.
- Upload maximum defaults to 20 MiB and is configurable through environment configuration.
- `COOKIE_SECURE` defaults to true. It may be false only in development; production startup must reject that configuration.
- Leaderboards use standard competition ranking (`1, 1, 3`), ordered by score descending and earlier completion time. Equal rank requires identical score and completion time.
- NFR04, NFR05, and NFR10 use automated axe and Playwright viewport/browser checks plus a manual checklist documented in `docs/MANUAL_TESTS.md`.
- FR-21/NFR17 use the maintained `obscenity` library plus editable custom and allow JSON lists. Matching normalizes accents, leetspeak, separators, and repeated letters, then uses token boundaries and an allow-list to reduce false positives. The backend re-checks all user-visible fields and AI output; frontend checks are advisory only. Offending text is never logged or echoed, and ten violations within ten minutes trigger a temporary cooldown without an automatic ban. The confident custom terms currently included are `fok`, `kak`, `poes`, and `isifebe`; uncertain regional terms are intentionally not guessed. No filter is perfect, determined users can invent spellings, and the custom list needs periodic review.
- Deletion policy: academic records use `RESTRICT`; owned children such as options, answers, group membership, games, and questions cascade where safe.
- The requested PGlite local database is an approved local-development deviation. PGlite does not provide the `citext` contrib extension, so emails are stored lowercased with a `lower(email)` unique index and a database check. The application lowercases emails before persistence. PGlite's socket server serializes query execution; it cannot fully prove row-locking/concurrency behavior. The concurrency tests remain in the suite and are marked for real PostgreSQL verification through `REAL_TEST_DATABASE_URL`.
- PGlite also does not expose the `pgcrypto` extension, but its PostgreSQL-compatible engine provides `gen_random_uuid()` as a built-in function, so the extension request was removed without changing UUID defaults or constraints.

## 2026-10-27 — FR-22 Infected solo mode

- Infected is the only enabled playable game. The later Stage 0 decision removes the superseded `speed_round` and `match_pairs` rows; every replacement game remains disabled until its own gate passes.
- Each turn aims to offer one Easy, one Medium, and one Hard card. Missing difficulty slots are filled from any remaining unused questions. Fewer than three remaining questions produces fewer cards; no remaining questions ends the session as `exhausted` without a win or loss.
- Every question placed on a turn is considered offered, including unchosen cards, and can never be offered again in that session.
- `GAME_MIN_QUESTIONS` defaults to 6. An enabled Infected game below the threshold is listed as unavailable with the reason “Not enough questions for this game yet.”
- There is one in-progress solo session per game and user. Starting again resumes it; starting after a terminal session creates a replay. Solo v1 has no time limit.
- Infected uses `scoring: 'practice'`. Its score is cure-reward points earned for correct answers only and is stored only in `game_sessions`; it never enters quiz attempts, leaderboards, or scored-attempt analytics.
- The existing `canAccessGame` policy remains the single access boundary: enrolled students may play practice quizzes; competitive quizzes unlock only after that student completes their scored attempt. A lecturer may play games for modules they own, but normal module ownership still prevents access to another lecturer’s quiz.
- A `games` row for Infected is attached automatically when a quiz is created. This keeps session foreign keys explicit while availability remains catalog- and question-count-driven.
- Public card IDs are the underlying question UUIDs. Before a card is chosen, the API returns only difficulty, topic, reward, and penalty. Correctness and the explicit correct answer are returned only after submission.
- AI explanations must contain one or two sentences, be at most 300 characters, contain no instruction-like text, and pass the shared profanity check. The backend remains the final validation authority.
- The pre-existing game-catalog invariant was renumbered from `INV-16` to `INV-23` so the approved Infected invariants occupy `INV-16` through `INV-22` exactly.
- Stage 2 group mode is not part of the solo implementation or this decision. Its rules must be recorded separately before implementation begins.

## 2026-10-27 — FR-23–FR-27 Stage 0 game platform

- Persist question difficulty as `DifficultyLevel` 1–5. The one shared `tierOf(level)` mapping is 1–2 Easy, 3 Medium, and 4–5 Hard. Infected keeps its approved Easy/Medium/Hard behavior by deriving those labels and transitions from the numeric level.
- AI quiz output must contain `difficulty_level` from 1 through 5. Missing, fractional, or out-of-range levels are invalid AI output under INV-11 and are never persisted. The deterministic MockProvider cycles through all five levels.
- `speed_round` and `match_pairs` are superseded and removed from the catalog. `flashcards` remains disabled. The foundation seeded `memory_match`, `timer_trivia`, `boss_battle`, and `pixel_racer` disabled; migration 009 enables only `memory_match` after its solo gate passed. The remaining catalog rows may be enabled only after their own stage is green.
- Infected retains its dedicated session tables. New solo games use versioned JSONB state in `game_plays` plus append-only `game_play_moves`; each game owns a strict Zod state schema so mechanics can evolve without changing the shared storage shape.
- Generic play moves store the accepted move payload and resulting versioned state. The ordered move log is the rebuild source; terminal plays reject later moves at the database boundary.
- A lecturer’s shared game-progress view returns only game type, play count, and completion count for modules they own. It never returns user identity, state, questions, or options.
- The demo competitive quiz now has 40 questions distributed across five topics and all five levels so all approved solo games can share one stable fixture.

## 2026-10-27 — FR-28 Island Escape solo mode

- All Island Escape numbers are centralized in `backend/src/games/island_escape/config.js`: 30 minimum questions, three phases of ten, 10 base points, a three-answer streak threshold, two-times points while active, five wrong answers per setback, and three retries before the fourth setback ends the play.
- The first three consecutive correct answers score 10 each. Doubling starts on the next question, continues while answers remain correct, and affects points only. A wrong answer resets the streak and doubling.
- Phase 1 setbacks discard that attempt's materials and restart Phase 1. Phase 2 setbacks discard boat parts and restart Phase 2. Phase 3 setbacks discard the boat and return to Phase 2 while preserving Phase 1 materials. Earned score is never removed.
- Question selection prefers levels 1–2 in Phase 1, level 3 in Phase 2, and levels 4–5 in Phase 3, filling shortages from the nearest level. It uses never-asked questions first; after a setback exhausts that pool, it recycles least-recently asked questions. A question cannot repeat within one phase attempt.
- Island Escape uses the shared versioned `game_plays` and append-only `game_play_moves` records. One in-progress solo play per student/game/quiz resumes on start; terminal plays may be replayed. Personal best is stored separately per student and quiz.
- The existing `canAccessGame` rule applies unchanged. Island Escape is practice-only, and its score, state, setbacks, and personal best never affect scored attempts, leaderboards, or analytics.
- Public start/refresh responses contain the current question and options but no correctness. The correct option and explanation appear only in the answer response. There is no game free text.

## 2026-10-27 — npm audit remediation

- Non-breaking `npm audit fix` updates were applied in commit `544bd3d`: body-parser, ip-address, multer, qs, undici, and zod. The audit changed from 12 findings (5 moderate, 5 high, 2 critical) to 6 (3 moderate, 1 high, 2 critical).
- The remaining findings are dev-only: `@vitest/mocker` (moderate, transitive via Vitest; path traversal/arbitrary file read and unauthenticated manual-mock code injection), `esbuild` (moderate, transitive via Vite; dev-server cross-origin request/response exposure), `tinypool` (critical, transitive via Vitest; prototype-pollution-to-RCE worker gadget), `vite` (high, direct dev dependency; dev-server path traversal, Windows launch-editor/command and file disclosure issues), `vite-node` (moderate, transitive via Vitest/Vite; inherited Vite exposure), and `vitest` (critical, direct dev dependency; UI-server arbitrary file read/execute and related mock issues).
- These packages are not in the production backend/frontend runtime bundle. The vulnerable paths are reachable only when a developer runs local Vite/Vitest tooling, not through the deployed EduQuest API or built frontend. Mitigation: keep dev servers localhost-only and never enable Vitest UI for untrusted users.
- A deliberate patched major toolchain attempt (`vitest@5.0.5`, `vite@8.3.5`) was not retained: Vitest 5 removed the existing `describe.sequential` API and transformed the authorization-matrix guard so its required executable-assertion check failed. The compatibility failure was verified in the full suite and reverted without changing tests. Remaining findings require a coordinated test-toolchain migration; no `npm audit fix --force` was used.
- `pip-audit` was installed from PyPI on 2026-10-27 and run against `ai-service/requirements.txt`. The compatible FastAPI/Starlette update to FastAPI `0.121.0` and Starlette `0.49.1` removed the advisories fixed by the available compatible releases. Twelve records remain: Starlette advisories whose fixed versions are `1.0.1`, `1.3.0`, or `1.3.1`, not currently supported by the FastAPI dependency line used here, and the pytest advisory whose fixed version is `9.0.3`, a major-version change. The Starlette issues are runtime-relevant to the AI service's HTTP server; the pytest issue is development-only. No non-breaking fix is available for these remaining records. Mitigation: keep the AI service behind the local/API boundary, do not expose its development server, and schedule a coordinated FastAPI/Starlette and pytest compatibility review. The Python suite remains pinned to the currently compatible major versions.

## 2026-10-27 — Scheduled test-toolchain upgrade

- The remaining Vite/Vitest audit findings require a coordinated upgrade task. That task must refactor the existing `describe.sequential` usage and the authorization-matrix source guard while preserving exactly 177 tests and the same assertions. It is a separate task and must not be started without explicit approval.

## 2026-10-28 — AI service exposure hardening

- The AI service binds to `127.0.0.1` by default through `ai-service/run.py`. Binding to `0.0.0.0` requires the explicit `AI_ALLOW_PUBLIC_BIND=true` opt-in. The backend worker is the only application caller; the frontend uses backend `/api` routes and never calls the AI service directly.
- Backend-to-AI requests carry `AI_SERVICE_TOKEN`. The service compares it with a constant-time comparison, rejects missing or incorrect tokens with 401, and never includes the token in logs or error responses. `npm run db:setup-check` generates a random token in `.env` when it is missing.
- The service enforces `AI_MAX_BODY_BYTES` (default 2 MiB) and `AI_REQUEST_TIMEOUT_SECONDS` (default 45). FastAPI docs and OpenAPI are disabled outside development. These controls mitigate the remaining Starlette advisories while the FastAPI dependency line does not support their patched major versions.
- Revisit this decision when FastAPI supports a patched Starlette release: run `pip-audit -r ai-service/requirements.txt`, review the Starlette fixed versions and changelog, then rerun all AI and full application gates before any upgrade.

## 2026-11-01 — npm audit follow-up

- The recorded audit baseline at commit `4458bcd` was 6 findings: 3 moderate, 1 high, and 2 critical. The current audit reports 11: 8 moderate, 1 high, and 2 critical. `npm audit fix` was run without `--force`; it made a non-breaking Vitest patch-level lock refresh but reduced the count by 0.
- No direct dependency was added for the report artifacts. The report renderer uses Playwright already present in the project, and the generated report files remain committed. Extraneous Mermaid packages previously present in `node_modules` are not in `package.json` or `package-lock.json`; `npm audit fix` removed them from the installed tree.
- Since `4458bcd`, the lockfile upgrades were applied by `544bd3d` (`body-parser` 2.3.0→2.4.0, `ip-address` 10.7.3→10.7.5, `multer` 2.4.0→2.5.0, `qs` 6.16.0→6.17.0, `undici` 8.11.2→8.12.3, and `zod` 4.6.5→4.6.7) and `3b9477f` (`rollup` 4.64.3→4.65.1 with its platform packages, and `postcss` 8.5.29→8.5.32). Both commits were authored by the project maintainer. None of these upgraded packages is the source named in the current 11 findings.
- The current findings are all development-only and are unreachable through the production API or built frontend: `@eslint-community/eslint-utils` (moderate, transitive through ESLint), `@eslint/config-array` (moderate, transitive through ESLint), `@eslint/eslintrc` (moderate, transitive through ESLint), `eslint` (moderate, direct dev dependency), `minimatch` (moderate, transitive through ESLint), `@vitest/mocker` (moderate, transitive through Vitest), `esbuild` (moderate, transitive through Vite), `vite-node` (moderate, transitive through Vitest/Vite), `vite` (high, direct dev dependency), `tinypool` (critical, transitive through Vitest), and `vitest` (critical, direct dev dependency).
- The advisories cover glob-pattern denial of service in `minimatch`, dev-server request/response exposure in `esbuild`, Vite path traversal and Windows launch-editor/file-disclosure/command issues, Vitest mock path traversal and unauthenticated mock code injection, and Tinypool prototype-pollution-to-RCE worker gadgets. These paths are reachable only when local developer tooling is run. Vite and the backend/AI services now bind to `127.0.0.1`; Vitest UI is disabled. No forced major upgrade was applied because the previously tested major upgrade broke `describe.sequential` and the authorization-matrix guard.

## 2026-10-30 — Timer Trivia solo defaults

- Timer Trivia is solo and practice-only in this stage. It uses 10 rounds, 30 seconds per round, up to five topics, and point rows 10/20/30/40/50 mapped to difficulty levels 1–5.
- The server owns deadlines and timeout decisions. The `extended_time` profile preference doubles the server deadline; clients cannot supply timing, score, correctness, or status.
- Each cell maps to one distinct question and cannot be reused. Results are stored only as generic practice plays/personal bests and never enter scored attempts, leaderboards, or analytics. Multiplayer is explicitly deferred.

## 2026-11-01 — Demo-data and browser-test isolation

- Browser and axe tests use a fresh per-run PGlite instance in `.pgdata/e2e-suite` on port 55436, with backend, AI service and frontend ports 4391, 8391 and 5391. The runner waits for `select 1`, seeds that database, and tears it down; a guard rejects the development database target.
- `npm run seed` is intentionally idempotent and non-destructive, using stable demo keys and preserving existing attempts and game plays. `npm run seed:reset` is a separate interactive operation, disabled in production.
- The quizzes API and UI use server pagination (20 by default), title search, and newest-first ordering so accumulated data cannot flood the page.
- Identity upgrade slice: existing `full_name` is retained for compatibility while `first_name`, optional `last_name`, `student_type`, and `email_verified_at` are added. Legacy rows are backfilled by splitting on the first space; legacy fixture inserts receive a safe default student type through the migration trigger. New registration uses the split-name fields and stronger password policy.
- Development email verification uses a file mailer under ignored `docs/dev-mail/`; it never contacts SMTP. Tokens are random, hashed in the database, single-use, and expire after 24 hours. The token value is not written to chat or source control.
- MFA backend uses AES-256-GCM for the TOTP secret, RFC 6238 SHA-1/30-second/6-digit codes with a ±1-step window, single-use recovery codes, and a five-minute login challenge. `MFA_ENCRYPTION_KEY` is generated by `setup:token` and never printed. Lecturer enforcement and MFA frontend remain separate follow-up work.

## Profile management

- Profile editing uses the same server-side identity schemas as registration for names, email and passwords. Preferred languages are a lookup-backed many-to-many relation seeded with the ten approved programming languages.
- Email changes use `pending_email`; the current email remains active until the new address completes the existing single-use verification flow. Password changes revoke every other session and preserve the current session.

## 2026-11-01 — Module and resource catalogue context

- Modules now carry `Year` (1–3), `Programme` (`it`, `business`, or `both`), `Offering`, and a bounded description. Existing rows are conservatively backfilled to Year 1, Programme `both`, Semester 1, with an empty description; module-code digits are used only as a best-effort year hint when available.
- Student profiles and registrations carry `StudentYear` (1–3). Legacy callers that omit it retain the safe Year 1 default; the student-facing form presents an explicit year choice.
- The first-year look-ahead is a read-only year-2 projection filtered by programme and contains no resource, quiz, answer, enrolment, or availability fields.
- “New resources” on module cards means resources created in the preceding 14 days. Resource tiles and lists remain constrained by enrollment, lecturer ownership, and existing study-group visibility.

## 2026-11-01 — Study group collaboration

- Groups use the existing programming-language lookup through `group_languages`. New groups default to `module` visibility; `members` and `private` are available for future moderation needs.
- Recommendation score is deterministic: +30 matching module, +20 matching Year, +20 matching programme (including `both`), +10 per preferred-language overlap capped at +20, and +10 for a focus match. Reasons expose only aggregate matches.
- A student creator becomes leader. Leaders can add/remove co-leaders. A leader must hand over before leaving; a database trigger prevents deleting or demoting the last leader.
- Group updates are leader-authored, profanity-checked, sanitized plain text capped at 200 characters. The UI displays one latest `Doing now` item and up to three `Next up` items.

## 2026-11-01 — Practice Lab / IT Code Lab

- Lab checks are declarative only in v1. The server stores lecturer configuration and student self-checked progress, but never executes lecturer or student code.
- The preview is an iframe using `sandbox="allow-scripts"` only, with a network-blocking CSP. The browser watchdog recreates a stalled frame after three seconds.
- Student submissions are progress evidence, not authoritative grading. Lab results never affect leaderboards, scored attempts or quiz analytics (INV-66).
- A plain textarea editor with line numbers is used to avoid adding an unnecessary dependency; it keeps the Code Lab offline and auditable.

## 2026-11-01 — Business Labs

- Spreadsheet formulas use a bounded recursive-descent evaluator shared in spirit by the browser and test implementation. No `eval`, `Function` constructor, server-side execution, network access, storage or cookies are used for student formulas.
- Spreadsheet checks are tolerance-based and expected values remain lecturer-only in the student projection. Student progress is explicitly self-checked.
- Calculator templates are declarative configurations. The first seeded templates are break-even, ROI, loan repayment, gross profit margin and VAT; scenario nodes must be finite and terminate before publishing.
- Business lab outcomes remain practice-only and are excluded from leaderboards, scored attempts and quiz analytics.

## Manual quiz authoring

- Lecturers can create draft quizzes manually or publish them through the same strict question validation boundary used by the manual authoring API. A published quiz with attempts is treated as immutable for destructive question edits; lecturers duplicate it into a new draft instead.
- Code-question snippets are escaped display data only. EduQuest never executes lecturer or student code on the server; previews use the existing isolated client sandbox rules where applicable.

## Study group sessions and calendar

- A recurrence is expanded into separate weekly session rows (one to twelve inclusive) instead of a recurrence rule. Each occurrence can therefore be edited, cancelled or duplicated independently.
- Session clashes are warnings, not booking blocks: leaders see their group’s overlapping sessions and members see overlaps with sessions they already RSVP’d “going” to.
- Module lecturers can read calendars for their own modules, but are read-only unless they also belong to that study group. This preserves the student-led group boundary.
- The reminder worker runs once per minute. For a session that enters both reminder windows after downtime, it may produce both the 24-hour and one-hour reminders; unique `(user, dedup_key)` prevents repeats after a restart.
- Calendar downloads use a minimal escaped RFC 5545 representation. They contain no remote resources, invitation addresses or user data beyond the session’s own public-to-group fields.

## Local AI generation correction (2026-11-02)

- Local generation uses three source excerpts across long documents, capped at
  6,000 characters by default (60,000 for hosted providers). The UI discloses
  sampling; lecturers must review coverage. This does not claim coverage of all
  208 pages of a long upload. `AI_MAX_SOURCE_CHARS` is configurable.
- Use the installed 1B model on the present 8 GB PC, per the earlier low-memory
  model decision. Keep the configured real provider; never substitute mock output.
- Local structured JSON derives from the quiz Pydantic schema. Invalid responses
  remain invalid; exact requested question count is also enforced before saving.
- Align the default local service timeout with the 300-second provider budget;
  use a bounded six-minute worker request and expire orphaned jobs after 15 minutes.
  Retrying an old job resets its waiting period via updated_at, not created_at.
- Cancellation is authoritative: check the job status under a row lock before
  creating a draft, and never revive a cancelled job in the failure handler.

## Group messaging and resource sharing

- Group messages are plain text. React renders message bodies as text nodes; the only automatic links are `https:` URLs with `noopener noreferrer` and `_blank`. HTML and Markdown are never interpreted.
- The module lecturer may read a group chat for their module but may not post unless they are also a member. This is the same read-only boundary used for session calendars.
- Announcements are pinned automatically for leaders, with a maximum of three active pinned announcements. A leader may remove any message; ordinary members may remove only their own.
- Message notifications are generated for announcements, replies, and explicit `@Full Name` mentions. Ordinary messages without a mention do not notify every group member.
- Existing resources are attached by reference after a server scope check. Small uploads reuse the upload directory outside the web root, use randomized stored names, and are served only through the membership-authorized attachment route.

# Local eight-question generation follow-up — 2026-11-02

On the existing 8 GB PC, use one-question local batches with a 1,200-token cap
and coordinated 600/630/660-second provider/service/worker budgets, configured
locally and documented in OFFLINE_AI.md. Do not silently switch to MockProvider.
Local requests separate instructions from source text, use temperature 0.3 and
move a bounded source window on every request, including rejected batches.
Grounding and duplicate rejection remain mandatory. Rejections carry feedback
into subsequent requests and only aggregate counts are logged.

Three live eight-question attempts failed; no complete quiz was persisted.
The 1B model repeated a question 19 times in one attempt and produced invalid
output in the last attempt. These changes are not proof of reliable generation.
Further live retries stopped; a more capable model must be evaluated before
claiming this requirement done. No paid API was used for these attempts.

## 2026-11-02 — Games polish: Memory Match selection and hub accessibility

- Memory Match previously dealt the first six eligible questions by `question_id`, so every play of a quiz used the same six pairs. A play now samples six eligible questions at random in the database (`ORDER BY random()`); only card placement was randomised before.
- Eligible Memory Match questions must have distinct correct-answer text (case-insensitive). Two answer cards with identical text, such as several "True" answers, were visually indistinguishable yet only one was the right partner. The six-pair minimum now counts distinct answers, so a quiz of only True/False answers returns `NOT_ENOUGH_QUESTIONS` instead of an unwinnable-looking board.
- The games hub "Choose" buttons now carry the game name as their accessible name and expose `aria-pressed`, and the quiz picker is fetched only after a game is selected.
- Game balance (Boss Battle exhaustion, Pixel Racer bot accuracy) was reviewed and deliberately left unchanged pending a product decision.

### 2026-11-03 — Account management, student collaboration, role navigation and PWA

- Administrators can create students, lecturers and administrators in Users. Admin-created accounts start verified with a required password-change flag; temporary passwords are hashed and never returned by the API. Creation and the audit entry commit together.
- User deletion revokes sessions, removes verification/MFA credentials and preferences, and anonymises the account. Academic results and shared records retain their foreign keys. Deleted users cannot be reactivated. Self-deletion and removal of the final active administrator are rejected. Lecturer-owned modules require an active replacement; student group leadership transfers to another active member or the empty group becomes private. Administrator mutations serialize and recheck the acting administrator after acquiring locks.
- Direct conversations belong to exactly two students. Other students and lecturers cannot read or send into them. The student directory exposes names and study information, never email addresses or credentials. Messages use database-backed rate limits, participant checks, strict text validation, ordered pagination and private/no-store responses. Reads mark only fetched incoming messages as read.
- Enrolled students can discover module-visible groups, filter joined/available groups, invite other enrolled students and accept or decline invitations. Invitations require consent rather than silently enrolling recipients. A known group UUID does not bypass private membership. The primary leader can hand leadership to another active member before leaving.
- Lecturer navigation excludes Games and Practice Labs. Quizzes opens an owner-authorized questions-and-answers review for manual and AI-generated quizzes, including drafts. Editing and creation remain authoring actions; student attempts and game controls are absent from this view.
- Profile no longer offers changing email or managing MFA for any role. Existing MFA login protections remain valid. Production administrator onboarding lives in the Admin screen so a newly created administrator can satisfy the existing mandatory protection. Interrupted, unconfirmed setup resumes safely.
- Hash routes preserve quiz, game and study-session locations on refresh and browser back/forward. Routes also apply role restrictions. Games explicitly remain practice regardless of the source quiz's competitive status.
- The PWA manifest supplies standalone display, regular/maskable icons and Apple metadata. The versioned service worker caches only public build assets and the offline page. Private API responses, sessions and mutations never enter CacheStorage; no offline submission queue exists. Updates require an explicit reload after saving work. iOS provides Safari/Add to Home Screen guidance.
- Group chat polling refreshes the latest page with ETags to reflect edits/removals without duplicating messages. Group switches discard delayed responses. The legacy incremental cursor compares creation time and UUID together, rather than treating random UUIDs as chronological.
- Follow-up PWA checks found that Firefox's Playwright offline emulation still permits service-worker network requests. A dedicated browser test now shuts down its own static origin, proves the cached offline page appears, restarts the origin and checks recovery. The emulation check still verifies the offline banner. No browser case is skipped. Navigation fetches bypass the HTTP cache, and every `/api/v1` response, including authentication errors, carries `Cache-Control: private, no-store` in addition to the service worker's API exclusion.

### 2026-11-03 — Memory Match eligibility correction

- The previous 140-character question / 60-character answer filters discarded valid authored and AI-generated text. Production quizzes with 12, 5 and 8 questions were reduced to only 3, 3 and 4 eligible pairs and could not meet the six-pair minimum.
- Memory Match now starts with at least two distinct question/answer pairs and deals up to six pairs. Migration 030 updates the catalogue minimum and description. Larger quizzes still use randomized six-pair rounds.
- The game picker and dealing endpoint share the same SQL eligibility rules. Multiple-choice and true/false questions with nonblank correct answers are supported without the old display-length limits. Answers differing only in whitespace or letter case are deduplicated so identical-looking cards cannot represent different pairs. Code and free-text questions remain excluded from this fixed-option game.
- Card fronts grow to fit the returned text instead of clipping it in a fixed-height face. The board states its actual pair count. Hidden card text, ownership checks and competitive-attempt locks remain server enforced.

### 2026-11-03 — Remove MFA at the owner's explicit request

- All roles, including production administrators, now authenticate using email and password. The administrator role/active-account guard remains; the mandatory MFA gate, login challenges, authenticator enrolment UI and recovery-code login UI are removed.
- Registration email OTP verification remains enabled. Password hashing, secure sessions, sign-in rate limits, account-status checks and role/ownership authorization remain unchanged.
- Former MFA routes return `410 MFA_REMOVED` and cannot issue sessions or new credentials. Authenticated legacy management URLs retain authentication checks. This gives existing open tabs a clear instruction to return to password login.
- Migration 031 removes saved authenticator secrets, recovery codes and login challenges. It preserves users, password hashes, roles, sessions, verification records and academic data. Historical tables remain empty for migration/backup compatibility; legacy response fields report `mfa_enabled=false`.
- QR-generation dependencies, MFA helpers and the MFA encryption-key startup requirement are removed. Tests exercise legacy enabled credential rows, production admin access, rejected wrong passwords, role boundaries, retired endpoints and migration data preservation.

### 2026-11-03 — Persist lecturer access to module join codes

- The saved-module catalogue omitted `join_code`, while creation returned it. The UI therefore displayed a code only until its local creation state was lost on navigation or reload.
- The lecturer catalogue now includes each owned module's existing code. Student catalogue responses continue to omit it, and lecturer ownership restrictions remain enforced.
- Lecturer module cards label the selectable code “Student join code”, explain how to share it, and provide clipboard copying with a manual-copy fallback. Newly created and fetched module cards are deduplicated by ID.

### 2026-11-03 — Make student Practice Labs usable in production

- Production had no lab records. The exercises in the developer seed existed only in demo modules; normal students consequently received an empty catalogue. Migration 032 adds four system-owned starter exercises (code, spreadsheet, calculator and scenario) without running the demo seed or enrolling students into unrelated modules.
- Starter labs have no module/author and are constrained to published system scope. Existing module labs retain required module/author references and their enrolment/lecturer ownership checks. Students can read starter content and save only their own attempts; lecturers cannot change or delete system starters.
- Catalogue rows are summaries. The UI now requests authorized lab details before mounting a player, reports detail-loading failures, and shows a useful search-empty state. This fixes missing starter code, grids, calculator fields and scenario nodes.
- Code drafts restore on reopening; saved scenario terminal nodes restore their reflection. Spreadsheet saves compute feedback and completion against server-held expected values, return feedback immediately and keep expected answers private. Practice progress remains separate from scored quizzes and leaderboards.

### 2026-11-03 — Recover from AI health-check startup delays

- Live configuration and authenticated AI health requests were valid. The previous status endpoint imposed a one-second deadline, and each resource card permanently disabled generation after its initial failed probe. A transient startup/network delay therefore appeared as persistent misconfiguration.
- Health probes now allow 15 seconds, share concurrent requests, validate the expected JSON health response and cache success for 30 seconds. Failures remain immediately retryable. Tokens stay in server-side headers and are never included in status output.
- Resource cards provide an explicit status recheck and retry transient unavailability after 15 seconds. Network errors remain distinct from confirmed missing configuration. Health reachability is advisory; only confirmed missing provider settings block submission. Actual generation still validates ownership, source material and provider output through the durable worker.

### 2026-11-03 — Email domain and profile password corrections

- Registration checks mail routing before hashing or persisting a new account: accept an MX host or SMTP's implicit IPv4/IPv6 fallback; reject nonexistent domains, domains with no mail route, and explicit null MX. DNS requests have bounded timeouts. Temporary DNS errors return a retryable 503 instead of declaring the address invalid. Sign-in continues to accept existing account addresses without depending on DNS.
- No provider allowlist is imposed: school, business and custom mail domains remain supported. DNS cannot detect a misspelling that resolves to another mail-capable domain or prove an individual mailbox exists; the existing email verification code remains the ownership check.
- Profile password fields have independent show/hide controls, autocomplete hints, field-associated accessible errors and separate success/error state from profile editing. Confirmation mismatches are caught locally and on the server. New-password policy failures no longer appear as current-password failures. Fields and visibility reset only after a successful change.
- Password changes lock the user row and verify the current hash inside a transaction on one checked-out connection. Updating the hash, clearing the temporary-password reset flag and revoking other sessions commit together. The current session remains valid. A session-write failure rolls back the password update; errors release the connection.
- DNS fixtures live in test suites and the isolated browser-server entry point. The production application has no test-only domain bypass. The owner subsequently authorized pushing this correction to Rahul’s GitHub and updating the live site. Release validation is recorded in `docs/EMAIL_PASSWORD_RELEASE_2026-11-03.md`.

### 2026-11-03 — Remove the unused admin Moderation section

- At the owner's request, remove the Moderation tab, report cards/actions and the related Open reports overview metric from the admin UI. Remove the unused refresh/action handler. Overview, Users, Modules, System and Audit remain available.
- This is a presentation change; no database migration or report-data deletion is required. Existing admin component and browser navigation checks now assert that Moderation is absent.

### 2026-11-03 — Reversible account deactivation and reliable session controls

- The owner replaced deletion/anonymization with reversible inactivity. Migration 033 adds `inactive` without altering existing account records. The legacy DELETE route now marks inactive and revokes sessions atomically, preserving personal details, password hashes, verification state, preferences, enrolments, group memberships/leadership, lecturer ownership and academic records. Deprecated replacement-lecturer input is accepted for old clients but does not transfer ownership. Legacy already-deleted records are not rewritten.
- Admin Users labels the action Deactivate, explains retention, keeps inactive users searchable and offers Activate. Suspension and deactivation block fresh sign-in and authenticated API access. Revoke sessions signs out current sessions while permitting a fresh login. Action-specific messages replace the generic “User updated” response; self-suspension/deactivation is disabled in the UI and guarded by the server.
- Admin status changes lock administrator rows in consistent order, recheck the acting administrator and lock the target user. Session creation also locks/rechecks that user, preventing a concurrent sign-in from bypassing revocation/deactivation. Status updates, session revocation and audits commit together; failure rolls back.
- Open clients validate sessions every 15 seconds while visible, on focus and visibility changes, and after an authenticated endpoint returns UNAUTHENTICATED. They return to sign-in when access is revoked. A wrong current password remains a form error. Expiry notifications recheck the current cookie before clearing state so an old request cannot sign out a newly established session.
- Browser regression checks isolate optional external Google Fonts traffic to avoid a stalled stylesheet request obscuring account-action results. No production font loading behavior is changed.

### 2026-11-03 — Choose a student year when uploading documents

- Lecturer uploads offer Year 1, Year 2 or Year 3, defaulting to the selected module's year. The server validates the audience and stores `resources.target_year`. Older upload clients default to the module's year; invalid years and unknown metadata are rejected. Group-scoped uploads must reference a group in the same module.
- Resource visibility uses the student's current saved study year in addition to existing enrolment/group permissions. The same predicate filters listings, search, counts, direct file delivery, linked chat attachments and study-session preparation choices/details/downloads. Owning lecturers retain access to their documents.
- Migration 034 adds a nullable year and module/year/date index. NULL preserves existing documents' audience; no historic document is reassigned or deleted. New uploads always receive a concrete year through the upload endpoint.
- The upload form consumes the saved resource response, confirms the server-saved year and refreshes the resource list and module counts. Cards show the saved audience. Study-session file delivery uses the existing authorized private-storage reader while retaining download disposition.
- Validation uses isolated test data. Production verification is read-only apart from the additive schema migration and deployment; existing production users and documents are not changed for testing.

### 2026-11-03 — Admin signup parity and mandatory email verification

- Admin Add user uses the public signup name fields, shared password requirements/show-hide controls, confirmation and inline validation, with a Student/Lecturer/Admin selector. Student type/year appear only for students. The API accepts the canonical signup password fields while retaining the legacy temporary-password payload for compatibility; ambiguous password inputs are rejected.
- All creation routes apply the same email syntax, DNS mail-routing and personal/common-password policy. DNS failures are distinguished from invalid domains. Account creation and its audit commit before delivery; a failed mail send retains the account and reports delivery unavailable.
- The owner explicitly chose email OTP before access for every admin-created role. Migration 035 adds a server-controlled flag defaulting false to preserve existing users. New managed accounts are unverified and flagged true. Their sessions allow only identity, verification, resend and logout until verification succeeds. Admin activation cannot bypass this gate; pending administrators do not count as usable administrators for last-admin protection.
- Signup delivery investigation: the production SMTP configuration authenticated against Gmail. Some local connection attempts failed before authentication; the root cause of the owner's earlier missing message could not be correlated without the address/time. A fresh live signup to a Gmail alias of the previously supplied demo inbox returned delivery sent after Gmail accepted the SMTP submission. Inbox placement was not independently verified.
- SMTP retries once only for transient failures during CONN, using the same OTP/link. Authentication, recipient and DATA failures are not retried automatically, avoiding duplicate submissions and concealing neither invalid credentials nor provider rejections. Failure logs contain only allowlisted SMTP code/phase/numeric status, never credentials, recipient, server response or OTP. Resend failures now receive the same safe diagnostic logging.
- Production QA uses a distinct demo-inbox alias; only that new QA account is deactivated and its sessions revoked afterward. Existing users and their access remain unchanged. Automated suites use development-file delivery or mocks, never external inboxes.

### 2026-11-03 — Student navigation containment and actionable code-lab errors

- The desktop sidebar keeps its viewport height but now scrolls internally, and its children do not shrink below their intended size. Mobile retains its wrapping, document-flow navigation. This prevents Practice Labs, Profile and Log out from overflowing the dark sidebar on short windows or at larger zoom levels.
- Quizzes distinguishes module loading, request failure and a genuinely empty module list. Errors expose a Retry loading modules action; the selector is disabled while unavailable. An unselected module no longer triggers a duplicate catalogue request.
- Code labs validate HTML source before rendering, rather than treating the browser's repaired DOM as proof of valid markup. The browser build of HTML-Validate is loaded on Run in a separate chunk. Rules detect malformed syntax, unclosed/misordered tags, invalid nesting and duplicate attributes while accepting full documents, fragments and permitted optional closing tags. Diagnostics include source line/column. This is HTML feedback, not an exhaustive CSS validator.
- The sandbox bridge is a separate script installed before student content. JavaScript parse failures, runtime exceptions and unhandled promise rejections therefore cannot prevent diagnostic capture or the heartbeat from initializing. Checks run after iframe load instead of a fixed 100 ms delay. Student scripts remain sandboxed with the existing restrictive CSP and no same-origin access.
- Editing invalidates checks without executing each partial edit. Run snapshots the submitted code; source/runtime errors block successful self-check completion even if repaired DOM selectors match. Reset clears previous errors/results. A missing heartbeat stops repeated preview reloads and reports an unresponsive preview; this is not a guarantee of preempting synchronous browser-blocking JavaScript. Background-tab timer throttling does not trigger the watchdog.
- Draft fetch/save failures use visible error alerts, not success styling. A late draft fetch does not overwrite newly edited work. Code-lab checks remain explicitly self-checked browser practice, with no academic score/XP changes or server-side execution of student JavaScript. Existing server authorization, attempt storage and quiz correctness remain unchanged.

### 2026-11-03 — Hide lecturer preferred languages

- At the owner's request, Edit profile omits the Preferred languages fieldset only for lecturers. Student and admin controls remain as before. Lecturer profile saves omit the hidden preference field so existing saved languages are preserved rather than rewritten. No stored preferences are deleted and no database migration is required.
