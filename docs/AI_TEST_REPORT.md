# AI test report

## Eight-question follow-up — 2026-11-02

Verdict: **eight-question generation is not reliable on the configured local
llama3.2:1b model**. Three bounded end-to-end attempts produced zero saved quizzes.
No validation was weakened; the diagnostic job is failed, not queued for more retries.

| Attempt                                                             | Elapsed seconds | Outcome                                                |
| ------------------------------------------------------------------- | --------------: | ------------------------------------------------------ |
| One-question batches, larger coordinated deadlines                  |             327 | No complete validated result; no quiz saved            |
| Grounding/duplicate feedback and smaller source windows             |             306 | One accepted question, 19 duplicates; HTTP 502         |
| Separate instructions/source, advancing windows and temperature 0.3 |             143 | One accepted question, then malformed output; HTTP 502 |

The real lecturer API accepted the request for eight questions and the worker
processed the existing PDF. Source extraction and job claiming are working;
the model output is the remaining blocker. Single-question checks passed, but
they do not establish eight-question reliability. Tokens were not measured.

Changes retain source grounding and duplicate checks, carry rejection feedback
forward, prevent a rejected batch from fixing the source window in one place,
and record aggregate rejection counts without text or secrets. Configuration
is documented in OFFLINE_AI.md. The Python suite passed 55/55 with zero skipped.
No new browser run was needed for these provider-only changes. Further live
retries stopped after the third unsuccessful attempt.

Final offline gate: lint, format and type-check passed; combined JavaScript run
passed 228 unit/component tests plus 328 database/API tests, zero skipped. Python
passed 55 tests, zero skipped. This run did not reproduce the earlier native DB
startup crash, but does not establish that intermittent issue permanently fixed.

## Latest verification — 2026-11-02

Verdict: **not working reliably for the lecturer's five-question PDF request**.
The real local provider remains configured; no mock fallback was enabled.
The lecturer retry endpoint accepted the job (202), and the worker claimed it.
Both the smaller-model run and the schema-constrained run failed with HTTP 504
(`AI_TIMEOUT`), around the 300-second request deadline; neither persisted a quiz.
The job was left failed to stop further automatic diagnostic retries.
Provider: `openai_compatible`; host: `127.0.0.1`; model: `llama3.2:1b`.

PDF extraction, source sampling, cancellation, stale-job recovery, strict count
validation and safe failure messages have regression coverage. The isolated
MockProvider generation/edit/publish browser journey passed 6/6 (Chromium and
Firefox, 390/768/1280), with zero axe violations. This proves the application
pipeline, not the real model. No new 15-question human review set was generated.

The standalone DB/API suite passed 328/328 and Python passed 51/51. Unit and
frontend tests passed 228/228. However, the final combined `npm test` exited
non-zero when the database test process crashed at startup with Windows exit
code 3221226505 (0xC0000409). The whole gate is therefore **not green**.
See [the diagnosis](AI_PDF_DIAGNOSIS.md) for limitations and evidence.

## Earlier fixture result (not proof of the current PDF job)

Local live generation completed through the strict provider pipeline.

- Provider: `openai_compatible`
- Host: `127.0.0.1`
- Model: `llama3.2:3b`
- Valid questions: `3`
- Elapsed seconds: `76.97`
- Strict schema validation: `PASS`
- Groundedness filter: `PASS for accepted questions`
- Human-review questions written: `6`

The groundedness check is lexical and therefore only a rough automated check; human review remains necessary. No secret values were recorded.
