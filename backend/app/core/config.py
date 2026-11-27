import os


def _normalize_database_url(url: str) -> str:
    for scheme in ("postgres://", "postgresql://"):
        if url.startswith(scheme):
            return f"postgresql+psycopg://{url[len(scheme):]}"
    return url


def _database_url_from_environment() -> str:
    is_vercel = os.getenv("VERCEL") == "1" or bool(os.getenv("VERCEL_ENV"))
    url = os.getenv("DATABASE_URL")
    if not url:
        if is_vercel:
            raise RuntimeError("DATABASE_URL must be configured for Vercel deployments.")
        return "sqlite:///./bloodflow.db"

    normalized_url = _normalize_database_url(url)
    if is_vercel and not normalized_url.startswith("postgresql+psycopg://"):
        raise RuntimeError("DATABASE_URL must use PostgreSQL for Vercel deployments.")
    return normalized_url


DATABASE_URL = _database_url_from_environment()
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
