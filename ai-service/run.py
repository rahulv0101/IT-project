import os
from pathlib import Path
from config import load_clean_env

load_clean_env(os.environ.get("EDUQUEST_ENV_FILE", Path(__file__).resolve().parent.parent / ".env"))
if not os.environ.get("AI_SERVICE_TOKEN"):
    raise RuntimeError("AI_SERVICE_TOKEN is missing: run npm run setup:token")

import uvicorn
from app import provider, require_service_token


require_service_token()
provider()


host = os.environ.get("AI_BIND_HOST", "127.0.0.1")
if host == "0.0.0.0" and os.environ.get("AI_ALLOW_PUBLIC_BIND") != "true":
    raise RuntimeError("AI_BIND_HOST=0.0.0.0 requires explicit AI_ALLOW_PUBLIC_BIND=true")

uvicorn.run(
    "app:app",
    host=host,
    port=int(os.environ.get("AI_PORT", "8000")),
    app_dir=os.path.dirname(__file__),
)
