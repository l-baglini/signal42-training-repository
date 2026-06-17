"""Shared Anthropic client factory.

Model ids and the API key come from settings/env — never hardcoded (CLAUDE.md §3).
The SDK auto-retries 429/5xx with backoff; we raise max_retries from settings.
"""

from __future__ import annotations

from functools import lru_cache

from anthropic import AsyncAnthropic

from app.config import get_settings


@lru_cache(maxsize=1)
def get_client() -> AsyncAnthropic:
    settings = get_settings()
    return AsyncAnthropic(
        api_key=settings.anthropic_api_key,
        max_retries=settings.anthropic_max_retries,
    )
