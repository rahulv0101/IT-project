# PDF generation diagnosis — 2026-11-02

The most recent PDF generation jobs failed after three attempts with
`GENERATION_FAILED`. The worker previously sent the literal placeholder
`Uploaded educational material.` for every PDF, rather than extracting it.

The worker now extracts PDFs using a bounded Python subprocess and pypdf.
Corrupt, empty and unsupported documents are rejected instead of inventing
source text. No document content or provider credentials are logged.

The user's latest PDF contains 208 pages. Extraction was verified against the
stored file: 498,317 characters, approximately 28 seconds. This does not prove
that the configured model can process the entire document or generate 30
questions. Large-document context handling and live generation remain unverified.

A subsequent live request using a 6,000-character excerpt of this actual PDF
returned HTTP 200 and one question in 30.2 seconds through `/generate-quiz`.
This establishes small-request connectivity and service validation, not full
document coverage, backend persistence, question quality, or a 30-question run.

The worker now samples three bounded passages across long documents (20%,
50%, 80% positions) rather than silently restricting content to opening and
closing pages. Local models use at most 6,000 characters; hosted providers
use 60,000. `AI_MAX_SOURCE_CHARS` changes that limit. The lecturer UI explicitly
warns that long resources are sampled and drafts need coverage review.
This is not whole-document coverage or a semantic retrieval system.

The AI service startup log also records a port-8000 bind conflict. A successful
health response alone does not establish that the newly launched process owns
that port. The former 45-second middleware timeout conflicted with the local
provider's 300-second budget. Local middleware now defaults to 300 seconds;
the SDK receives the remaining budget and automatic SDK retries are disabled.
The worker has its own six-minute request deadline. Orphaned running jobs are
failed after 15 minutes; retries use updated_at for their queue deadline.
Cancellation is checked under a row lock before quiz persistence.

On this 8 GB machine, the local model was changed to the already-installed
llama3.2:1b. No provider chain or mock fallback was added. The larger model and
unconstrained JSON run did not complete the five-question job. Local requests
now use a Pydantic-derived JSON schema, including the batch question count,
and still pass all existing semantic validation and the backend profanity check.
Reference: https://docs.ollama.com/api/openai-compatibility

The worker rejects incomplete question counts. Source excerpts and model output
are not logged. Lecturer errors use fixed messages keyed by safe error codes.

Regression evidence: `backend/tests/extract-resource.test.js` covers real PDF
extraction through the worker helper, safe rejection of a corrupt PDF, intact
text documents, and rejection of empty/unsupported sources. Full JavaScript
suite: 223 unit/frontend tests and 325 database/API tests passed, zero skipped.
Python suite: 48 passed, zero skipped. No browser tests were run for this fix.

## Follow-up verification

- The real lecturer retry endpoint returned HTTP 202 and the worker claimed the
  existing five-question PDF job. No additional quiz was created for the check.
- Both the smaller-model run and the schema-constrained smaller-model run ended
  with HTTP 504 / AI_TIMEOUT; neither saved a quiz. The failed job was left failed
  so no further automatic diagnostic retries occur. Request history was retained.
- Ollama reported CPU execution, a 4,096-token context window, and approximately
  12 generated tokens/second. Windows reported 8 GB RAM and roughly 600 MB free
  during the check. These measurements establish resource pressure, not proof
  that hardware is the only cause of invalid output or timeouts.
- Earlier raw JSON output reached its token cap. The local request now sends a
  Pydantic-derived JSON schema, but a successful five-question saved draft is
  still **not verified**. A single-question excerpt success does not prove it.
- No further live retries were attempted after repeated failures. The real
  provider remains configured. No mock result is presented as real AI evidence.

### Final regression results, 2026-11-02

| Area                          | Ran | Passed | Skipped | Evidence                                                              |
| ----------------------------- | --: | -----: | ------: | --------------------------------------------------------------------- |
| Unit (non-component JS tests) | 138 |    138 |       0 | Vitest unit configuration, excluding JSX component files              |
| Frontend components           |  90 |     90 |       0 | Six `frontend/src/*.test.jsx` files, including 63 in main.test.jsx    |
| Database/API, standalone      | 328 |    328 |       0 | Vitest DB configuration, 19 files                                     |
| Python                        |  51 |     51 |       0 | `python -m pytest ai-service -q`                                      |
| Focused browser/axe           |   6 |      6 |       0 | Lecturer generation/edit/publish journey; isolated MockProvider stack |

Lint, format, type-check and production build passed. The browser journey ran
in Chromium and Firefox at 390, 768 and 1280 with zero axe violations. This was
the focused generation flow, not the entire browser suite.

The final combined `npm test` passed all 228 unit/component tests but failed
during DB-process startup after migrations with native Windows exit code
3221226505 (0xC0000409), before DB tests ran. Earlier combined startup also
crashed, and one DB launch failed with ECONNREFUSED on the isolated test port.
The successful standalone DB run does not establish combined-suite stability.
No test was disabled or weakened; further infrastructure retries were stopped.
The new stale-job fixture was corrected to INSERT its historical timestamp:
the existing updated_at trigger overwrites timestamps supplied through UPDATE.

Remaining: diagnose native Node/PGlite startup instability; obtain a real
five-question validated and persisted draft within the model budget. Neither
hardware pressure nor the fixture correction proves the remaining root cause.
