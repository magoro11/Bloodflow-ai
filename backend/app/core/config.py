import os


def _normalize_database_url(url: str) -> str:
    for scheme in ("postgres://", "postgresql://"):
        if url.startswith(scheme):
            return f"postgresql+psycopg://{url[len(scheme):]}"
    return url


DATABASE_URL = _normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./bloodflow.db"))
JWT_SECRET = os.getenv("JWT_SECRET", "local-demo-secret-change-before-deployment")
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "60"))
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGIN",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
SEED_DEMO_DATA = os.getenv("SEED_DEMO_DATA", "true").lower() == "true"
