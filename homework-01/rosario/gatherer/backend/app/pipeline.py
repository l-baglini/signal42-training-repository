"""Per-topic run orchestration (ARCHITECTURE.md §4).

discover -> fetch -> rank_dedup -> finding_detection -> (agent + images + persist).
A failure in any single finding is isolated; the run records partial success rather
than crashing (CLAUDE.md §10).
"""

from __future__ import annotations

import asyncio
import uuid

from app.config import Settings, get_settings
from app.db import repositories as repo
from app.db.base import get_sessionmaker
from app.domain import FindingPlan
from app.logging import get_logger
from app.modules import finding_detection, rank_dedup, source_discovery
from app.modules.agent import DigestAgent
from app.modules.fetch import enrich
from app.modules.images import download_images

log = get_logger(__name__)


def _image_refs(plan: FindingPlan) -> list[tuple[str, str | None]]:
    """Collect (image_url, attribution) candidates from the plan's sources.
    download_images() caps the count via max_images_per_finding."""
    refs: list[tuple[str, str | None]] = []
    for ranked in plan.sources:
        c = ranked.candidate
        attribution = c.title or c.url
        for img in c.image_urls:
            refs.append((img, attribution))
    return refs


async def run_topic_pipeline(
    topic_id: uuid.UUID,
    settings: Settings | None = None,
    *,
    run_id: uuid.UUID | None = None,
) -> dict:
    """Execute a full run for one topic. Returns the run stats dict.

    If run_id is provided, that pre-created Run row is used (lets the API return a
    run_id immediately and execute the body in the background).
    """
    settings = settings or get_settings()
    sm = get_sessionmaker()

    async with sm() as session:
        topic = await repo.get_topic(session, topic_id)
        if topic is None:
            raise ValueError(f"Topic {topic_id} not found")
        if run_id is None:
            run = await repo.create_run(session, topic_id)
            run_id = run.id
        existing = await repo.existing_findings(session, topic_id)
        topic_name = topic.name  # read while the session is open
    stats: dict = {"candidates": 0, "kept": 0, "findings_new": 0, "findings_updated": 0, "errors": []}

    try:
        candidates = await source_discovery.discover(topic_name, settings)
        stats["candidates"] = len(candidates)

        await enrich(candidates, settings)
        ranked = rank_dedup.rank(
            candidates,
            authority_weight=settings.authority_weight,
            recency_weight=settings.recency_weight,
            half_life_days=settings.recency_half_life_days,
        )
        stats["kept"] = len(ranked)

        plans = await finding_detection.detect(topic_name, ranked, existing, settings)
        actionable = [p for p in plans if p.decision in ("new", "updated")]

        agent = DigestAgent(settings)
        for plan in actionable:
            try:
                result = await agent.run(topic_name, plan)
                # Never store an incomplete digest as if it succeeded — skip it so
                # the next run retries instead of showing the empty placeholder.
                if result.hit_iteration_guard:
                    log.error("digest_incomplete_skipped", finding=plan.title)
                    stats["errors"].append(f"{plan.title}: digest incomplete (guard)")
                    continue
                stored = await download_images(_image_refs(plan), settings)
                async with sm() as session:
                    await repo.persist_finding(session, topic_id, run_id, plan, result, stored)
                if plan.decision == "new":
                    stats["findings_new"] += 1
                else:
                    stats["findings_updated"] += 1
            except Exception as exc:  # noqa: BLE001 — one finding must not sink the run
                log.error("finding_failed", finding=plan.title, error=str(exc))
                stats["errors"].append(f"{plan.title}: {exc}")

        status = "partial" if stats["errors"] else "ok"
    except Exception as exc:  # noqa: BLE001
        log.error("run_failed", topic=topic_name, error=str(exc))
        stats["errors"].append(str(exc))
        status = "failed"

    async with sm() as session:
        await repo.finish_run(session, run_id, status, stats)
    log.info("run_finished", topic=topic_name, status=status, **{k: v for k, v in stats.items() if k != "errors"})
    return {"run_id": str(run_id), "status": status, **stats}


# Keep references to background tasks so they aren't garbage-collected mid-run.
_background_tasks: set[asyncio.Task] = set()


async def trigger_run(topic_id: uuid.UUID) -> uuid.UUID:
    """Create the Run row now (so the caller gets a run_id) and execute the body
    in the background. Used by the manual-trigger endpoint and the scheduler."""
    sm = get_sessionmaker()
    async with sm() as session:
        run = await repo.create_run(session, topic_id)
        run_id = run.id

    task = asyncio.create_task(run_topic_pipeline(topic_id, run_id=run_id))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return run_id
