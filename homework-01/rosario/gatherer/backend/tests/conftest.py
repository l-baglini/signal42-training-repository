"""Shared test setup: provide the env vars Settings requires, with no real keys."""

from __future__ import annotations

import os

os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("TAVILY_API_KEY", "test-tavily-key")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")


def make_settings(**overrides):
    """Build a Settings instance with test defaults, overridable per test."""
    from app.config import Settings

    settings = Settings()  # reads the env set above
    for key, value in overrides.items():
        setattr(settings, key, value)
    return settings
