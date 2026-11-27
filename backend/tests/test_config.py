import pytest

from app.core.config import _database_url_from_environment, _normalize_database_url


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("postgres://db.example/bloodflow", "postgresql+psycopg://db.example/bloodflow"),
        ("postgresql://db.example/bloodflow", "postgresql+psycopg://db.example/bloodflow"),
        ("postgresql+psycopg://db.example/bloodflow", "postgresql+psycopg://db.example/bloodflow"),
        ("sqlite:///./bloodflow.db", "sqlite:///./bloodflow.db"),
    ],
)
def test_normalize_database_url_selects_psycopg_for_postgres(url: str, expected: str) -> None:
    assert _normalize_database_url(url) == expected


def test_database_url_defaults_to_sqlite_outside_vercel(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("VERCEL_ENV", raising=False)

    assert _database_url_from_environment() == "sqlite:///./bloodflow.db"


@pytest.mark.parametrize(
    ("name", "value"),
    [("VERCEL", "1"), ("VERCEL_ENV", "production")],
)
def test_database_url_is_required_on_vercel(
    monkeypatch: pytest.MonkeyPatch,
    name: str,
    value: str,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("VERCEL_ENV", raising=False)
    monkeypatch.setenv(name, value)

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        _database_url_from_environment()


def test_database_url_uses_configured_postgres_url_on_vercel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://db.example/bloodflow")
    monkeypatch.setenv("VERCEL_ENV", "production")

    assert _database_url_from_environment() == "postgresql+psycopg://db.example/bloodflow"


def test_database_url_rejects_sqlite_on_vercel(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./bloodflow.db")
    monkeypatch.setenv("VERCEL", "1")

    with pytest.raises(RuntimeError, match="PostgreSQL"):
        _database_url_from_environment()
