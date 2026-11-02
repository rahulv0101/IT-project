# Decisions

## 2026-11-02 — Registration validation and email OTP

- New student registration requires first and last names. Names are validated server-side and the API returns field-level validation details; the frontend mirrors those details beside the corresponding input.
- Password requirements are displayed individually while typing. Client checks are advisory; the server remains authoritative for password composition and identity checks.
- Registration verification uses a six-digit, single-use code stored only as a hash and expiring after ten minutes. Existing verification-link requests remain supported for compatibility with existing accounts and profile email changes.
- Email delivery uses SMTP when `SMTP_HOST` and `SMTP_FROM` are configured. Development without SMTP writes the code to the ignored `docs/dev-mail/` directory so local tests remain deterministic; production refuses to fall back to filesystem mail.
- Existing users, sessions, attempts, and academic records are not cleared or rewritten by this change. The existing verification-token table is reused, so no destructive migration is required.

## 2026-11-02 — Local Ollama default for desktop launch

- Fresh desktop setups configure the existing OpenAI-compatible AI provider for Ollama at `127.0.0.1:11434/v1`, with model `phi3:mini`. The local placeholder API key is required by the client library and is not a secret.
- Local provider and service request timeouts are 300 seconds so CPU-bound model generation is not cut off by the service's general 45-second default.
- The launcher resolves its project root from the batch file location, checks Node.js/npm and Python before starting, and creates the service token only after the database startup has created `.env`.
- The launcher installs the pinned AI-service Python requirements when their imports are missing, so a first run can bring up the AI service without a separate manual pip step.
- When the configured provider points to local Ollama, the launcher starts its local server if needed and reports a missing configured model before starting the remaining services.
- Existing `.env` values are preserved. Model installation and Ollama availability are handled as local machine prerequisites; quiz correctness and scores remain server-authoritative.

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

## Group messaging and resource sharing

- Group messages are plain text. React renders message bodies as text nodes; the only automatic links are `https:` URLs with `noopener noreferrer` and `_blank`. HTML and Markdown are never interpreted.
- The module lecturer may read a group chat for their module but may not post unless they are also a member. This is the same read-only boundary used for session calendars.
- Announcements are pinned automatically for leaders, with a maximum of three active pinned announcements. A leader may remove any message; ordinary members may remove only their own.
- Message notifications are generated for announcements, replies, and explicit `@Full Name` mentions. Ordinary messages without a mention do not notify every group member.
- Existing resources are attached by reference after a server scope check. Small uploads reuse the upload directory outside the web root, use randomized stored names, and are served only through the membership-authorized attachment route.
