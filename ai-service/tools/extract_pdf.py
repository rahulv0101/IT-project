"""Extract local PDF text for the worker. Never print paths or document errors."""
import sys
from pypdf import PdfReader


def extract(path):
    reader = PdfReader(path)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    if not text.strip():
        raise ValueError("DOCUMENT_HAS_NO_TEXT")
    if len(text.encode("utf-8")) > 1_000_000:
        raise ValueError("DOCUMENT_TOO_LARGE")
    return text


if __name__ == "__main__":
    try:
        # PDF diagnostics may include document text; suppress library logging.
        import logging
        logging.disable(logging.CRITICAL)
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdout.write(extract(sys.argv[1]))
    except Exception:
        sys.stderr.write("DOCUMENT_EXTRACTION_FAILED\n")
        sys.exit(1)
