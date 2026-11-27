import pytest

from app.core.config import _normalize_database_url


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
