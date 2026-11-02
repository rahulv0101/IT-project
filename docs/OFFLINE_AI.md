# Offline AI with Ollama

Historical optional setup: the active configuration now uses OpenRouter and
Claude Haiku 5.5. Follow [OPENROUTER.md](OPENROUTER.md) for current setup.

EduQuest can use a local Ollama model through the existing
`openai_compatible` provider. The frontend never calls Ollama directly; the
backend calls the AI service, which calls Ollama on localhost.

## Install and choose a model

Install Ollama from the official Ollama website and start the Ollama desktop
application. Check installed models with:

```powershell
ollama list
```

For a PC with 16 GB RAM or more, prefer a 7B–8B model. For less memory, use a
3B model such as `llama3.2:3b`:

```powershell
ollama pull llama3.2:3b
```

## `.env`

Set these four lines in the project-root `.env`:

```text
AI_PROVIDER=openai_compatible
AI_BASE_URL=http://127.0.0.1:11434/v1/
AI_API_KEY=ollama
AI_MODEL=llama3.2:3b
```

Change only `AI_MODEL` if you installed another model. To switch back to
Google's OpenAI-compatible endpoint, set `AI_PROVIDER=openai_compatible`, set
`AI_BASE_URL` to the Google `/openai/` endpoint, set `AI_API_KEY` to the local
Google key, and set `AI_MODEL` to the model you selected. Never commit `.env`.

## Run

1. Start Ollama.
2. Double-click `Run EduQuest.bat` on the Desktop.
3. After the app is running, double-click `Check EduQuest AI.bat`.

The checker makes one small request first and does not use a server port.

## Troubleshooting

### Small-PC generation settings

For the installed 1B local model on this 8 GB PC, generation is configured as
one question per batch (`AI_BATCH_SIZE=1`) with a 1,200-token request cap
(`AI_MAX_TOKENS`). Eight questions are merged and validated before saving a draft;
an incomplete or invalid result is never presented as a finished quiz.

The bounded budgets must agree: `AI_TIMEOUT_SECONDS=600` for the whole generation,
`AI_REQUEST_TIMEOUT_SECONDS=630` for the HTTP service, and
`AI_WORKER_TIMEOUT_MS=660000` for the backend worker. This leaves time for a small
CPU-only model while remaining below the worker's 15-minute stale-job limit.
These are local configuration choices, not promises of completion time. Restart
the AI service and worker after changing them. Do not run heavy test suites at
the same time as local generation on a memory-constrained PC.

Local batches use a 2,400-character window within the source supplied by the
worker. The window moves forward on each request, including after rejection. Grounding is still
checked against the source, duplicates are still rejected, and a rejected batch
gets explicit grounding or duplication feedback rather than the same prompt
again. A lecturer must review coverage and correctness before publishing.
Local requests separate instructions and source text into system and user
messages, and use temperature 0.3 rather than repeating greedy output. Hosted
provider prompts and temperature are unchanged.

- “Ollama is not running”: start the Ollama desktop application.
- “Model not downloaded”: run `ollama pull <model>`.
- Timeout or out-of-memory: choose a smaller model, close other applications,
  or increase `AI_TIMEOUT_SECONDS`.
- If Windows reports Access denied, run the command from a normal terminal with
  the project folder as the current directory; do not repeatedly retry it here.
