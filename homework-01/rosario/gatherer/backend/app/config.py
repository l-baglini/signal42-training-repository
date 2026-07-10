"""Centralized, env-driven configuration.

Every tunable lives here; nothing is hardcoded at the call site (CLAUDE.md §10).
Secrets (API keys, DB URL) come from the environment and are never logged.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Secrets / connections (no defaults; must be provided) ---
    anthropic_api_key: str = Field(..., alias="ANTHROPIC_API_KEY")
    tavily_api_key: str = Field(..., alias="TAVILY_API_KEY")
    database_url: str = Field(..., alias="DATABASE_URL")

    # --- Claude models (ids from env, never hardcoded — CLAUDE.md §3) ---
    digest_model: str = Field("claude-sonnet-4-6", alias="DIGEST_MODEL")
    cluster_model: str = Field("claude-haiku-4-5", alias="CLUSTER_MODEL")

    # --- Scheduler ---
    # Default daily at 06:00; per-topic override via topic.schedule_cron.
    default_schedule_cron: str = Field("0 6 * * *", alias="DEFAULT_SCHEDULE_CRON")
    scheduler_enabled: bool = Field(True, alias="SCHEDULER_ENABLED")

    # --- Pipeline tuning ---
    max_candidates_per_topic: int = Field(40, alias="MAX_CANDIDATES_PER_TOPIC")
    fetch_concurrency: int = Field(8, alias="FETCH_CONCURRENCY")
    fetch_timeout_seconds: float = Field(20.0, alias="FETCH_TIMEOUT_SECONDS")
    recency_half_life_days: float = Field(14.0, alias="RECENCY_HALF_LIFE_DAYS")
    authority_weight: float = Field(0.6, alias="AUTHORITY_WEIGHT")
    recency_weight: float = Field(0.4, alias="RECENCY_WEIGHT")

    # --- Agent (ReAct) loop ---
    agent_max_iterations: int = Field(6, alias="AGENT_MAX_ITERATIONS")
    # Per-turn output ceiling (thinking + text/tool args share this).
    agent_max_tokens: int = Field(12000, alias="AGENT_MAX_TOKENS")
    # Hard per-finding token budget (input+output+cache summed across the loop).
    # Once exceeded, the next turn is forced to write the digest and stop — caps cost.
    agent_token_budget: int = Field(60000, alias="AGENT_TOKEN_BUDGET")
    anthropic_max_retries: int = Field(5, alias="ANTHROPIC_MAX_RETRIES")
    # How many new source URLs since last digest count as "materially new".
    material_change_threshold: int = Field(2, alias="MATERIAL_CHANGE_THRESHOLD")

    # --- Images ---
    image_store_dir: str = Field("/data/images", alias="IMAGE_STORE_DIR")
    max_images_per_finding: int = Field(4, alias="MAX_IMAGES_PER_FINDING")
    max_image_bytes: int = Field(5_000_000, alias="MAX_IMAGE_BYTES")

    # --- Misc ---
    log_level: str = Field("INFO", alias="LOG_LEVEL")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()  # type: ignore[call-arg]
