# Memory Match eligibility fix — 2026-11-03

Memory Match was requiring six pairs while excluding questions longer than 140 characters and answers longer than 60. A production read-only audit found:

| Quiz                     | Questions | Previously eligible | Eligible after correction | Pairs in each new round |
| ------------------------ | --------- | ------------------- | ------------------------- | ----------------------- |
| Study Guide              | 12        | 3                   | 12                        | 6                       |
| practice mad             | 5         | 3                   | 5                         | 5                       |
| Database foundations PDF | 8         | 4                   | 8                         | 6                       |

The picker and start endpoint now share one definition of eligible pairs. Rounds require two distinct correct answers and contain up to six pairs. Full authored text is supported, duplicate answer text is normalized consistently, and card faces grow to show longer content. Existing competitive locks and hidden-answer protection remain enforced.

Validation: 641 JavaScript/API tests passed (262 unit/component and 379 integration), zero skipped. The real-backend browser regression passed in Chromium at 390 and 1280 pixels and Firefox at 390 pixels: two long-text questions, matching picker/start counts, four cards, readable text without overflow, axe accessibility and game completion. ESLint and TypeScript passed.

Published application commit: `5eb8184` at https://eduquest-dun.vercel.app. Migration 030 applied successfully after saving a private production backup. Live authenticated checks confirmed all three banks are available and start correctly: Study Guide uses six pairs, practice mad five pairs, and Database foundations PDF six pairs. A mobile browser resumed the real Study Guide board and displayed a question longer than the former limit without horizontal overflow. The temporary validation student was deleted; existing user progress and quiz content were not modified.

The existing six-pair Memory Match completion, refresh, accessibility and competitive-lock browser flow also passed in Chromium mobile/desktop and Firefox mobile. Together with the new real-backend regression, six targeted browser checks passed. Formatting, lint, types, production build and credential scanning passed. No paid AI requests or real verification emails were needed.
