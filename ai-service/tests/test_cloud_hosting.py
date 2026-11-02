import base64
import io

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject


def test_environment_only_deployment(monkeypatch, tmp_path):
    from config import load_clean_env
    monkeypatch.setenv("AI_SERVICE_TOKEN", "cloud-test-token")
    assert load_clean_env(tmp_path / "absent.env") == {}
    import os
    assert os.environ["AI_SERVICE_TOKEN"] == "cloud-test-token"


def test_authenticated_cloud_pdf_extraction(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "cloud-test-token")
    import app
    client = TestClient(app.app)
    writer = PdfWriter()
    page = writer.add_blank_page(width=600, height=800)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})})
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 40 700 Td (Durable cloud PDF extraction) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(stream)
    output = io.BytesIO()
    writer.write(output)
    payload = {"content": base64.b64encode(output.getvalue()).decode()}
    assert client.post("/extract-pdf", json=payload).status_code == 401
    headers = {"x-ai-service-token": "cloud-test-token"}
    result = client.post("/extract-pdf", json=payload, headers=headers)
    assert result.status_code == 200
    assert "Durable cloud PDF extraction" in result.json()["text"]
    invalid = client.post("/extract-pdf", json={"content": "not a PDF!"}, headers=headers)
    assert invalid.status_code == 422
    assert invalid.json() == {"detail": "DOCUMENT_EXTRACTION_FAILED"}
