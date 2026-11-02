# OpenRouter quiz generation

The selected provider is OpenRouter and the model is
`anthropic/claude-haiku-5.5`. Ollama is not required. OpenRouter supports the
existing OpenAI-compatible client, so the queued worker, schema validation,
grounding checks and transactional draft persistence remain in use.

Official references:

- https://openrouter.ai/anthropic/claude-haiku-5.5
- https://openrouter.ai/docs/quickstart

## Configuration

Put these values in the project-root `.env`, which is ignored by Git:

```dotenv
AI_PROVIDER=openai_compatible
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=anthropic/claude-haiku-5.5
AI_API_KEY=your-openrouter-key
AI_MODEL_FALLBACKS=
AI_BATCH_SIZE=5
AI_MAX_TOKENS=6000
AI_MAX_REQUESTS_PER_RUN=20
AI_REQUEST_DELAY_MS=0
AI_TIMEOUT_SECONDS=120
AI_REQUEST_TIMEOUT_SECONDS=150
AI_WORKER_TIMEOUT_MS=180000
AI_MAX_SOURCE_CHARS=60000
```

The worker has a longer deadline than the HTTP service, which has a longer
deadline than provider generation. Generation is bounded and can incur
OpenRouter charges. No alternate model or mock fallback is configured.
Long documents are still sampled to 60,000 characters; review generated drafts
for coverage and correctness before publishing. The mini-scope and analysis
endpoints retain their existing template implementations.

## Python and startup

Use Python 3.11 or newer. On macOS/Linux:

```sh
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r ai-service/requirements.txt
npm run setup:token
```

For worker PDF extraction, set `PYTHON_EXECUTABLE` in `.env` to the absolute
path of `.venv/bin/python`. With the virtual environment activated and the
database configured/migrated/seeded as described in the README, run
`npm run dev`. Restart the AI service and worker after changing provider values.

## Verification

`python ai-service/tools/live_check.py --prepare` prints only provider, host
and model. `python ai-service/tools/live_check.py` performs paid generation
checks using bundled fixtures and writes a quality report. On Windows,
`scripts/check-ai.ps1` uses that same configured provider without invoking
Ollama. Normal Python tests force mock mode and do not contact paid providers.

Provider authentication, credit and model-access failures produce safe hosted
provider messages rather than recommendations to install Ollama. Never commit
API keys or put them in browser configuration.

## Verified on 2026-11-02

A real eight-question request through FastAPI returned HTTP 200 in 25.55 seconds
with exactly eight questions using the configured Haiku model. It used the
bundled database text fixture; full-PDF coverage, human review and database
persistence were not exercised by this check. The offline Python suite passed
55 tests, excluding the four Windows-specific launcher tests on this Mac.
