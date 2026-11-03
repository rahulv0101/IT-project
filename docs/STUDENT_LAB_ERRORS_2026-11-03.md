# Student page and practice-lab error fixes — 2026-11-03

## Cause and resulting behavior

The fixed-height sidebar allowed lower navigation buttons to overflow its background on short windows. It now scrolls within its viewport and retains usable button heights. Mobile navigation continues to wrap normally.

The Quizzes module picker previously hid request failures behind an empty selector. It now distinguishes loading, failure with retry, and no available modules.

Browsers repair invalid HTML, so the previous code lab could display a heading from broken source without reporting the markup errors. Student JavaScript was also interpolated inside the diagnostic script: a syntax error could prevent that whole script, including its error reporting, from parsing.

Run now validates original HTML and shows line/column errors. An independent sandbox bridge reports JavaScript syntax errors, exceptions and unhandled promises. Invalid source/runtime errors cannot result in a successful UI self-check merely because repaired DOM nodes exist. Checks wait for the iframe to load. Editing and Reset invalidate previous results, and failed draft requests display error alerts.

The validator uses the package's [browser build](https://html-validate.org/dev/running-in-browser.html) in a separate lazy-loaded chunk. It accepts snippets and complete documents, including permitted optional closing tags. No student source is sent to an external validation service. CSS is rendered by the browser; this change does not claim exhaustive CSS validation. Code checks remain browser self-checks and do not award academic scores or XP.

## Validation

- 697 automated tests passed: 300 unit/component and 397 API, zero skips.
- Six end-to-end scenarios passed on Chromium mobile/desktop and Firefox mobile: the new error/navigation scenario and all four starter-lab/restoration checks on each browser configuration.
- The new scenario reproduces the screenshot's malformed HTML, checks failed completion payloads, JavaScript parse/runtime/promise failures, correction, Reset, failed saves, module-list errors/retry, accessibility and short-window navigation containment.
- A generated desktop screenshot was visually inspected for readable errors, preview/editor layout and contained navigation.
- Lint, type checking, formatting and production build passed. No database migration is required.

Live deployment verification is appended after release.
