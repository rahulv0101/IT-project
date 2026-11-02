import os


# The normal suite must stay offline even when a developer's .env selects a live provider.
# Real verification opts in explicitly through AI_REAL_TESTS=true.
if os.environ.get("AI_REAL_TESTS") != "true":
    os.environ["AI_PROVIDER"] = "mock"
    for name in ("AI_BASE_URL", "AI_API_KEY", "AI_MODEL"):
        os.environ[name] = ""
if os.environ.get("AI_REAL_TESTS") != "true":
    os.environ["AI_SERVICE_TOKEN"] = "test-suite-token"
