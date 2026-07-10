"""In-process per-topic scheduler (APScheduler AsyncIOScheduler).

Runs inside the FastAPI event loop; started/stopped in the app lifespan. One job
per active topic, cron from topic.schedule_cron or the global default.

NOTE: an in-process scheduler lives in each process. Run the backend single-worker
(or gate startup behind a leader-election flag) or every job fires N times.
"""

from __future__ import annotations

import uuid

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings
from app.db import repositories as repo
from app.db.base import get_sessionmaker
from app.logging import get_logger
from app.pipeline import run_topic_pipeline

log = get_logger(__name__)

_scheduler: AsyncIOScheduler | None = None


def _job_id(topic_id: uuid.UUID) -> str:
    return f"topic:{topic_id}"


async def _run_job(topic_id_str: str) -> None:
    try:
        await run_topic_pipeline(uuid.UUID(topic_id_str))
    except Exception as exc:  # noqa: BLE001 — a scheduled run must not kill the scheduler
        log.error("scheduled_run_failed", topic_id=topic_id_str, error=str(exc))


def register_topic(topic_id: uuid.UUID, cron: str | None) -> None:
    if _scheduler is None:
        return
    cron = cron or get_settings().default_schedule_cron
    try:
        trigger = CronTrigger.from_crontab(cron)
    except ValueError:
        log.warning("bad_cron_fallback_default", topic_id=str(topic_id), cron=cron)
        trigger = CronTrigger.from_crontab(get_settings().default_schedule_cron)
    _scheduler.add_job(
        _run_job,
        trigger=trigger,
        id=_job_id(topic_id),
        args=[str(topic_id)],
        replace_existing=True,
        misfire_grace_time=3600,
        coalesce=True,
    )
    log.info("topic_scheduled", topic_id=str(topic_id), cron=cron)


def unregister_topic(topic_id: uuid.UUID) -> None:
    if _scheduler is None:
        return
    try:
        _scheduler.remove_job(_job_id(topic_id))
    except Exception:  # noqa: BLE001 — job may not exist
        pass


async def start() -> None:
    """Start the scheduler and register all active topics."""
    global _scheduler
    settings = get_settings()
    if not settings.scheduler_enabled:
        log.info("scheduler_disabled")
        return
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.start()
    sm = get_sessionmaker()
    async with sm() as session:
        topics = await repo.all_active_topics(session)
    for topic in topics:
        register_topic(topic.id, topic.schedule_cron)
    log.info("scheduler_started", topics=len(topics))


async def shutdown() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
