"""Bounded, in-process AI verification. No server or port is used."""
import json
import os
import random
import sys
import time
import argparse
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ai-service"))
from config import load_clean_env
from app import OpenAICompatibleProvider, QuizRequest
from tools.report_io import write_report

load_clean_env(ROOT / ".env")
fixture_dir = ROOT / "ai-service" / "tests" / "fixtures"
source = (fixture_dir / "clean-databases.txt").read_text(encoding="utf-8")
provider_name = os.environ.get("AI_PROVIDER", "mock")
url = urlparse(os.environ.get("AI_BASE_URL", ""))
model = os.environ.get("AI_MODEL", "")

parser = argparse.ArgumentParser()
parser.add_argument("--prepare", action="store_true")
if parser.parse_args().prepare:
    print(f"provider={provider_name}")
    print(f"host={url.hostname or 'none'}")
    if not model.strip():
        print("AI_MODEL is empty in .env")
        raise SystemExit(2)
    print(f"model={model.strip()}")
    raise SystemExit(0)

print(f"provider={provider_name}")
print(f"host={url.hostname or 'none'}")
print(f"model={model or 'none'}")

if provider_name != "openai_compatible":
    print("result=blocked: AI_PROVIDER is not openai_compatible")
    raise SystemExit(2)

started = time.perf_counter()
try:
    provider = OpenAICompatibleProvider()
    result = provider.generate_quiz(QuizRequest(extracted_text=source, question_count=3, difficulty="mixed"))
    elapsed = time.perf_counter() - started
    print(f"elapsed_seconds={elapsed:.2f}")
    print("first_attempt_validity=not separately observable from provider")
    print("after_retry_validity=valid")
    print(f"questions={len(result.questions)}")
    print("result=success")
except Exception as exc:
    elapsed = time.perf_counter() - started
    print(f"elapsed_seconds={elapsed:.2f}")
    message = str(exc)
    if "not running" in message.lower():
        classification = "ollama-not-running"
    elif "not downloaded" in message.lower():
        classification = "model-not-downloaded"
    elif "timed out" in message.lower():
        classification = "timeout"
    elif "memory" in message.lower():
        classification = "out-of-memory"
    else:
        classification = "provider-or-response-format"
    print(f"result=failed:{classification}")
    report = "# AI test report\n\nLive check failed before a verified generation.\n\n"
    report += f"- Provider: `{provider_name}`\n- Host: `{url.hostname or 'none'}`\n- Model: `{model or 'none'}`\n- Classification: `{classification}`\n- Elapsed seconds: `{elapsed:.2f}`\n"
    report += "\nNo secret values were recorded. Check the configured provider endpoint, credentials, model access and account balance before retrying.\n"
    write_report(ROOT / "docs" / "AI_TEST_REPORT.md", report)
    raise SystemExit(1)

# A successful run writes a compact human-review sample without credentials.
all_questions = [("clean-databases.txt", question) for question in result.questions]
for fixture in sorted(fixture_dir.glob("*.txt"))[:6]:
    try:
        response = provider.generate_quiz(QuizRequest(extracted_text=fixture.read_text(encoding="utf-8"), question_count=3, difficulty="mixed"))
        for question in response.questions:
            all_questions.append((fixture.name, question))
    except Exception:
        continue
random.Random(7).shuffle(all_questions)
review = ["# Human review sample\n", "Generated from local fixtures; review grounding manually.\n"]
for fixture_name, question in all_questions[:15]:
    review.append(f"## Source fixture: {fixture_name}\n")
    review.append(f"- Question: {question.question_text}\n- Topic: {question.topic}\n- Level: {question.difficulty_level}\n- Options: {json.dumps([o.option_text for o in question.options])}\n- Marked answer: {next(o.option_text for o in question.options if o.is_correct)}\n- Explanation: {question.explanation}\n")
write_report(ROOT / "ai-service" / "tests" / "quality" / "review.md", "\n".join(review))

report = "# AI test report\n\nLive generation completed through the strict provider pipeline.\n\n"
report += f"- Provider: `{provider_name}`\n- Host: `{url.hostname or 'none'}`\n- Model: `{model}`\n"
report += f"- Valid questions: `{len(result.questions)}`\n- Elapsed seconds: `{elapsed:.2f}`\n"
report += "- Strict schema validation: `PASS`\n- Groundedness filter: `PASS for accepted questions`\n"
report += f"- Human-review questions written: `{min(15, len(all_questions))}`\n"
report += "\nThe groundedness check is lexical and therefore only a rough automated check; human review remains necessary. No secret values were recorded.\n"
write_report(ROOT / "docs" / "AI_TEST_REPORT.md", report)
