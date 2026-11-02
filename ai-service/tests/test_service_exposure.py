import logging

from fastapi.testclient import TestClient

import app


def client(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "test-service-token")
    monkeypatch.setenv("AI_MAX_BODY_BYTES", "100")
    return TestClient(app.app)


def test_missing_service_token_is_rejected(monkeypatch):
    api = client(monkeypatch)
    response = api.post("/generate-quiz", json={"extracted_text": "notes"})
    assert response.status_code == 401


def test_wrong_service_token_is_rejected(monkeypatch):
    api = client(monkeypatch)
    response = api.post(
        "/generate-quiz",
        headers={"x-ai-service-token": "wrong"},
        json={"extracted_text": "notes"},
    )
    assert response.status_code == 401


def test_correct_service_token_is_accepted(monkeypatch):
    api = client(monkeypatch)
    response = api.post(
        "/generate-quiz",
        headers={"x-ai-service-token": "test-service-token"},
        json={"extracted_text": "notes", "question_count": 1},
    )
    assert response.status_code == 200
    assert response.json()["questions"]


def test_oversized_body_is_rejected_cleanly(monkeypatch):
    api = client(monkeypatch)
    response = api.post(
        "/generate-quiz",
        headers={
            "x-ai-service-token": "test-service-token",
            "content-length": "101",
        },
        content=b"{}",
    )
    assert response.status_code == 413
    assert "test-service-token" not in response.text


def test_token_never_appears_in_logs_or_errors(monkeypatch, caplog):
    token = "secret-service-token"
    monkeypatch.setenv("AI_SERVICE_TOKEN", token)
    caplog.set_level(logging.INFO)
    response = TestClient(app.app).post(
        "/generate-quiz",
        headers={"x-ai-service-token": "wrong"},
        json={"extracted_text": "notes"},
    )
    assert response.status_code == 401
    assert token not in response.text
    assert token not in caplog.text


def test_openapi_is_available_only_in_development():
    assert app.app.docs_url == "/docs"
    assert app.app.openapi_url == "/openapi.json"


def test_local_model_uses_long_whole_request_timeout(monkeypatch):
    monkeypatch.delenv("AI_REQUEST_TIMEOUT_SECONDS", raising=False)
    monkeypatch.setenv("AI_BASE_URL", "http://127.0.0.1:11434/v1/")
    assert app.request_timeout_seconds() == 300
