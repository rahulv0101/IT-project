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

The AI service startup log also records a port-8000 bind conflict. A successful
health response alone does not establish that the newly launched process owns
that port. The HTTP middleware currently defaults to a 45-second request timeout.

Regression evidence: `backend/tests/extract-resource.test.js` covers real PDF
extraction through the worker helper, safe rejection of a corrupt PDF, intact
text documents, and rejection of empty/unsupported sources. Full JavaScript
suite: 223 unit/frontend tests and 325 database/API tests passed, zero skipped.
Python suite: 48 passed, zero skipped. No browser tests were run for this fix.
