import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
from app import OpenAICompatibleProvider, QuizRequest


def payload(question_text="Database indexing speeds up lookups"):
    return json.dumps({
        "title": "Source quiz",
        "questions": [{
            "question_text": question_text,
            "topic": "Databases",
            "marks": 1,
            "difficulty_level": 3,
            "explanation": "The source states that indexes speed up lookups.",
            "options": [
                {"option_text": "Database indexing", "is_correct": True},
                {"option_text": "A network cable", "is_correct": False},
            ],
        }],
    })


class FakeCompletions:
    def __init__(self, values):
        self.values = iter(values)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        value = next(self.values)
        if isinstance(value, Exception):
            raise value
        return type("R", (), {"choices": [type("C", (), {"message": type("M", (), {"content": value})()})()]})()


def client(values):
    completions = FakeCompletions(values)
    return type("Client", (), {"chat": type("Chat", (), {"completions": completions})()})(), completions


def request(count=1, text="Database indexing speeds up lookups"):
    return QuizRequest(extracted_text=text, question_count=count)


def test_base_url_is_normalized():
    fake, _ = client([payload()])
    provider = OpenAICompatibleProvider(fake, base_url=' "https://example.test/openai/chat/completions" ', api_key="k", model="m", sleep=lambda _: None)
    assert provider.base_url == "https://example.test/openai/"


def test_localhost_http_is_allowed_and_remote_http_is_refused():
    fake, _ = client([payload()])
    assert OpenAICompatibleProvider(fake, base_url="http://127.0.0.1:11434/v1/", api_key="ollama", model="m").is_local
    with pytest.raises(RuntimeError, match="https"):
        OpenAICompatibleProvider(fake, base_url="http://remote.example/v1/", api_key="k", model="m")


def test_local_timeout_defaults_to_300_seconds(monkeypatch):
    monkeypatch.delenv("AI_TIMEOUT_SECONDS", raising=False)
    fake, _ = client([payload()])
    provider = OpenAICompatibleProvider(fake, base_url="http://localhost:11434/v1/", api_key="ollama", model="m")
    assert provider.timeout_seconds == 300


def test_configured_local_budget_generates_eight_distinct_validated_single_question_batches(monkeypatch):
    monkeypatch.setenv("AI_BATCH_SIZE", "1")
    monkeypatch.setenv("AI_TIMEOUT_SECONDS", "600")
    monkeypatch.setenv("AI_MAX_TOKENS", "1200")
    prompts = [
        "Why would an index help a lookup?",
        "How does normalization reduce duplication?",
        "What makes a primary key useful?",
        "When does a foreign key protect a relationship?",
        "Which operation retrieves table records?",
        "How can a transaction keep changes consistent?",
        "Why should related tables be joined?",
        "What is the purpose of a database constraint?",
    ]
    fake, calls = client([payload(text) for text in prompts])
    provider = OpenAICompatibleProvider(fake, base_url="http://127.0.0.1:11434/v1/", api_key="test-only", model="m", max_requests=8, retries=0, sleep=lambda _: None)
    result = provider.generate_quiz(request(count=8))
    assert [question.question_text for question in result.questions] == prompts
    assert len(calls.calls) == 8
    for call in calls.calls:
        assert call["max_tokens"] == 1200
        assert 0 < call["timeout"] <= 600
        assert call["response_format"]["json_schema"]["schema"]["properties"]["questions"]["maxItems"] == 1
    assert all(provider._grounded(question, request().extracted_text) for question in result.questions)


def test_actual_request_has_remaining_deadline_and_difficulty_instruction():
    fake, calls = client([payload()])
    provider = OpenAICompatibleProvider(fake, base_url="http://localhost:11434/v1/", api_key="k", model="m", sleep=lambda _: None)
    provider.generate_quiz(QuizRequest(extracted_text="Database indexing speeds up lookups", question_count=1, difficulty="hard"))
    assert 0 < calls.calls[0]["timeout"] <= provider.timeout_seconds
    assert "Requested difficulty: hard" in calls.calls[0]["messages"][0]["content"]
    shape = calls.calls[0]["response_format"]
    assert shape["type"] == "json_schema"
    assert shape["json_schema"]["schema"]["properties"]["questions"]["maxItems"] == 1


def test_json_fallback_cannot_bypass_request_cap():
    class Unsupported(Exception):
        status_code = 400
    fake, calls = client([Unsupported(), payload()])
    provider = OpenAICompatibleProvider(fake, base_url="http://localhost:11434/v1/", api_key="k", model="m", max_requests=1, retries=0, sleep=lambda _: None)
    with pytest.raises(RuntimeError):
        provider.generate_quiz(request())
    assert len(calls.calls) == 1


def test_local_source_window_moves_without_inventing_source_text():
    source = "BEGINNING " + "database concept " * 500 + " ENDING"
    fake, calls = client([payload(), payload()])
    provider = OpenAICompatibleProvider(fake, base_url="http://localhost:11434/v1/", api_key="test-only", model="m")
    req = QuizRequest(extracted_text=source, question_count=8, difficulty="mixed")
    provider._request_batch(req, 1, "m")
    provider._request_batch(req, 1, "m", avoid_questions=["accepted"] * 7)
    first = calls.calls[0]["messages"][1]["content"]
    last = calls.calls[1]["messages"][1]["content"]
    assert source[:2400] in first
    assert source[-2400:] in last
    assert "BEGINNING" in first and "ENDING" not in first
    assert "ENDING" in last and "BEGINNING" not in last
    assert source not in first and source not in last


def test_local_rejected_batch_moves_source_window_and_separates_untrusted_text():
    source = "database facts " * 600
    fake, calls = client([payload(), payload()])
    provider = OpenAICompatibleProvider(fake, base_url="http://localhost:11434/v1/", api_key="test-only", model="m")
    req = QuizRequest(extracted_text="START " + source + " END", question_count=8, difficulty="mixed")
    provider.requests = 1
    provider._request_batch(req, 1, "m")
    provider.requests = 2
    provider._request_batch(req, 1, "m")
    assert calls.calls[0]["messages"][0]["role"] == "system"
    assert "START" not in calls.calls[0]["messages"][0]["content"]
    assert calls.calls[0]["messages"][1]["role"] == "user"
    assert "START" in calls.calls[0]["messages"][1]["content"]
    assert "START" not in calls.calls[1]["messages"][1]["content"]
    assert calls.calls[0]["temperature"] == 0.3


def test_timeout_uses_model_fallback():
    timeout = TimeoutError("upstream timeout")
    fake, calls = client([timeout, payload()])
    provider = OpenAICompatibleProvider(fake, base_url="https://example.test/openai/", api_key="k", model="primary", retries=0, sleep=lambda _: None)
    provider.model_fallbacks = ["fallback"]
    assert provider.generate_quiz(request()).questions
    assert calls.calls[0]["model"] == "primary"
    assert calls.calls[-1]["model"] == "fallback"


def test_batching_merges_and_deduplicates():
    fake, calls = client([payload("Database indexing speeds up lookups"), payload("Database indexing speeds up lookups"), payload("Database normalization reduces redundancy")])
    provider = OpenAICompatibleProvider(fake, base_url="https://example.test/openai/", api_key="k", model="m", retries=0, sleep=lambda _: None, max_requests=3)
    result = provider.generate_quiz(request(count=2))
    assert len(result.questions) == 2
    assert len(calls.calls) == 3
    assert "Do not repeat or closely paraphrase" in calls.calls[1]["messages"][0]["content"]
    assert "Database indexing speeds up lookups" in calls.calls[1]["messages"][0]["content"]


def test_groundedness_drops_unsupported_question():
    unsupported = payload("Quantum teleportation proves the source claim").replace("Database indexing", "Quantum teleportation")
    supported = payload("Database indexing speeds up lookups")
    fake, _ = client([unsupported, supported])
    provider = OpenAICompatibleProvider(fake, base_url="https://example.test/openai/", api_key="k", model="m", retries=0, sleep=lambda _: None, max_requests=2)
    result = provider.generate_quiz(request())
    assert result.questions[0].question_text == "Database indexing speeds up lookups"


def test_grounding_rejection_is_explained_on_the_next_request():
    unsupported = payload("What happens in a vacuum?").replace("Database indexing", "Quantum teleportation")
    fake, calls = client([unsupported, payload()])
    provider = OpenAICompatibleProvider(fake, base_url="http://localhost:11434/v1/", api_key="test-only", model="m", retries=0, sleep=lambda _: None, max_requests=2)
    result = provider.generate_quiz(request())
    assert len(result.questions) == 1
    assert "not supported by the source" in calls.calls[1]["messages"][0]["content"]
    assert "short exact phrase" in calls.calls[1]["messages"][0]["content"]
    assert provider._grounded(result.questions[0], request().extracted_text)


def test_429_retry_after_is_respected():
    class RateLimit(Exception):
        status_code = 429
        headers = {"Retry-After": "7"}

    waits = []
    fake, _ = client([RateLimit(), payload()])
    provider = OpenAICompatibleProvider(fake, base_url="https://example.test/openai/", api_key="k", model="m", retries=1, sleep=waits.append)
    provider.generate_quiz(request())
    assert 7.0 in waits


def test_timeout_is_reported_without_secret():
    fake, _ = client([TimeoutError("private-key timeout")])
    with pytest.raises(RuntimeError, match="timed out") as error:
        OpenAICompatibleProvider(fake, base_url="https://example.test/openai/", api_key="private-key", model="m", retries=0, sleep=lambda _: None).generate_quiz(request())
    assert "private-key" not in str(error.value)


def test_messy_output_extracts_first_valid_json():
    fake, _ = client(["Here is your quiz:\n```json\n" + payload() + "\n```\nDone."])
    provider = OpenAICompatibleProvider(fake, base_url="http://127.0.0.1:11434/v1/", api_key="ollama", model="m", sleep=lambda _: None)
    assert provider.generate_quiz(request()).questions


def test_validation_error_is_fed_back_on_retry():
    fake, calls = client([payload().replace('"question_text": "Database indexing speeds up lookups"', '"question_text": ""'), payload()])
    provider = OpenAICompatibleProvider(fake, base_url="http://127.0.0.1:11434/v1/", api_key="ollama", model="m", retries=1, max_requests=2, sleep=lambda _: None)
    provider.generate_quiz(request())
    assert len(calls.calls) >= 2
    assert "failed validation" in calls.calls[1]["messages"][0]["content"]


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("connection refused", "not running"),
        ("404 model not found", "not downloaded"),
        ("out of memory", "out of memory"),
        ("request timed out", "timed out"),
    ],
)
def test_ollama_failure_messages(message, expected):
    fake, _ = client([RuntimeError(message)])
    provider = OpenAICompatibleProvider(fake, base_url="http://127.0.0.1:11434/v1/", api_key="ollama", model="m", retries=0, sleep=lambda _: None)
    with pytest.raises(RuntimeError, match=expected):
        provider.generate_quiz(request())
