"""Secret-safe, whitespace-tolerant environment loading for EduQuest AI."""
from pathlib import Path
import os


def read_env_file(path: str | Path) -> dict[str, str]:
    values: dict[str, str] = {}
    raw = Path(path).read_text(encoding="utf-8-sig")
    for line in raw.splitlines():
        line = line.strip().rstrip("\r")
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'").strip()
        if key:
            values[key] = value
    return values


def load_clean_env(path: str | Path) -> dict[str, str]:
    values = read_env_file(path) if Path(path).is_file() else {}
    for key, value in values.items():
        # Explicit process environment wins over the project file (important
        # for tests and for launcher-supplied configuration).
        os.environ.setdefault(key, value)
    return values
