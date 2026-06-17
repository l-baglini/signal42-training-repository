"""Data-access helpers. All DB reads/writes go through here so the pipeline and
API layers stay free of query details.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Digest, Finding, Image, ReadState, Run, Source, Topic
from app.domain import DigestResult, FindingPlan
from app.modules.finding_detection import ExistingFinding
from app.modules.images import StoredImage
from app.modules.rank_dedup import normalize_url

# --- Topics -----------------------------------------------------------------


async def list_topics(session: AsyncSession) -> list[tuple[Topic, int]]:
    """Topics with their unread finding counts."""
    unread = (
        select(Finding.topic_id, func.count().label("unread"))
        .join(ReadState, ReadState.finding_id == Finding.id, isouter=True)
        .where((ReadState.is_read.is_(False)) | (ReadState.finding_id.is_(None)))
        .group_by(Finding.topic_id)
        .subquery()
    )
    rows = await session.execute(
        select(Topic, func.coalesce(unread.c.unread, 0))
        .join(unread, unread.c.topic_id == Topic.id, isouter=True)
        .order_by(Topic.name)
    )
    return [(t, int(c)) for t, c in rows.all()]


async def create_topic(session: AsyncSession, name: str, schedule_cron: str | None) -> Topic:
    topic = Topic(name=name.strip().lower(), schedule_cron=schedule_cron)
    session.add(topic)
    await session.commit()
    await session.refresh(topic)
    return topic


async def get_topic(session: AsyncSession, topic_id: uuid.UUID) -> Topic | None:
    return await session.get(Topic, topic_id)


async def delete_topic(session: AsyncSession, topic_id: uuid.UUID) -> bool:
    topic = await session.get(Topic, topic_id)
    if topic is None:
        return False
    await session.delete(topic)
    await session.commit()
    return True


async def all_active_topics(session: AsyncSession) -> list[Topic]:
    rows = await session.execute(select(Topic).where(Topic.active.is_(True)))
    return list(rows.scalars().all())


# --- Findings / digests (read side) -----------------------------------------


async def list_findings(session: AsyncSession, topic_id: uuid.UUID) -> list[dict]:
    """Findings for a topic, newest digest first."""
    current = (
        select(Digest.finding_id, func.max(Digest.created_at).label("latest"))
        .where(Digest.is_current.is_(True))
        .group_by(Digest.finding_id)
        .subquery()
    )
    rows = await session.execute(
        select(Finding, current.c.latest, ReadState.is_read)
        .join(current, current.c.finding_id == Finding.id, isouter=True)
        .join(ReadState, ReadState.finding_id == Finding.id, isouter=True)
        .where(Finding.topic_id == topic_id)
        .order_by(current.c.latest.desc().nullslast())
    )
    out = []
    for finding, latest, is_read in rows.all():
        out.append(
            {
                "id": finding.id,
                "title": finding.title,
                "status": finding.status,
                "is_read": bool(is_read) if is_read is not None else False,
                "latest_digest_at": latest,
            }
        )
    return out


async def get_finding_detail(session: AsyncSession, finding_id: uuid.UUID) -> dict | None:
    finding = await session.get(
        Finding,
        finding_id,
        options=[selectinload(Finding.sources), selectinload(Finding.images), selectinload(Finding.read_state)],
    )
    if finding is None:
        return None
    digest = (
        await session.execute(
            select(Digest)
            .where(Digest.finding_id == finding_id, Digest.is_current.is_(True))
            .order_by(Digest.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return {"finding": finding, "digest": digest}


async def set_read_state(session: AsyncSession, finding_id: uuid.UUID, is_read: bool) -> bool:
    finding = await session.get(Finding, finding_id)
    if finding is None:
        return False
    rs = await session.get(ReadState, finding_id)
    now = datetime.now(timezone.utc) if is_read else None
    if rs is None:
        session.add(ReadState(finding_id=finding_id, is_read=is_read, read_at=now))
    else:
        rs.is_read = is_read
        rs.read_at = now
    await session.commit()
    return True


# --- Runs -------------------------------------------------------------------


async def create_run(session: AsyncSession, topic_id: uuid.UUID) -> Run:
    run = Run(topic_id=topic_id, status="running")
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


async def finish_run(session: AsyncSession, run_id: uuid.UUID, status: str, stats: dict) -> None:
    await session.execute(
        update(Run)
        .where(Run.id == run_id)
        .values(status=status, stats=stats, finished_at=datetime.now(timezone.utc))
    )
    await session.commit()


async def get_run(session: AsyncSession, run_id: uuid.UUID) -> Run | None:
    return await session.get(Run, run_id)


# --- Existing-findings snapshot for finding_detection -----------------------


async def existing_findings(session: AsyncSession, topic_id: uuid.UUID) -> list[ExistingFinding]:
    rows = await session.execute(
        select(Finding).where(Finding.topic_id == topic_id).options(selectinload(Finding.sources))
    )
    out = []
    for f in rows.scalars().all():
        out.append(
            ExistingFinding(
                finding_id=str(f.id),
                slug=f.slug,
                source_urls={s.normalized_url for s in f.sources},
            )
        )
    return out


# --- Persisting a digested finding (write side) -----------------------------


async def persist_finding(
    session: AsyncSession,
    topic_id: uuid.UUID,
    run_id: uuid.UUID,
    plan: FindingPlan,
    result: DigestResult,
    stored_images: list[StoredImage],
) -> Finding:
    """Create or update a finding and its versioned digest, sources, and images.

    decision == 'new'     -> create finding + first digest, unread
    decision == 'updated' -> mark prior digest non-current, add new digest, reset unread
    """
    # Resolve the existing finding for an update; None means it vanished between
    # the existing-findings snapshot and now, so fall back to creating fresh.
    finding = None
    if plan.decision == "updated" and plan.existing_finding_id:
        # Eager-load sources: async sessions forbid lazy loading, and we read
        # finding.sources below to dedup new source rows.
        finding = await session.get(
            Finding, uuid.UUID(plan.existing_finding_id), options=[selectinload(Finding.sources)]
        )

    if finding is not None:
        finding.status = "updated"
        finding.last_seen_run = run_id
        await session.execute(
            update(Digest)
            .where(Digest.finding_id == finding.id, Digest.is_current.is_(True))
            .values(is_current=False)
        )
        # Re-surface as unread.
        await session.execute(
            update(ReadState).where(ReadState.finding_id == finding.id).values(is_read=False, read_at=None)
        )
        existing_urls = {s.normalized_url for s in finding.sources}
    else:
        finding = Finding(
            topic_id=topic_id,
            title=plan.title,
            slug=plan.slug,
            status="new",
            first_seen_run=run_id,
            last_seen_run=run_id,
        )
        session.add(finding)
        await session.flush()  # assign finding.id
        session.add(ReadState(finding_id=finding.id, is_read=False))
        existing_urls = set()

    digest = Digest(
        finding_id=finding.id,
        run_id=run_id,
        what_changed=result.sections.what_changed,
        why_it_matters=result.sections.why_it_matters,
        technical_details=result.sections.technical_details,
        sources_md=result.sections.sources_md,
        body_md=result.body_md,
        model=result.model,
        is_current=True,
    )
    session.add(digest)

    # Attach sources (idempotent on normalized_url within the finding).
    for ranked in plan.sources:
        if ranked.normalized_url in existing_urls:
            continue
        existing_urls.add(ranked.normalized_url)
        session.add(
            Source(
                finding_id=finding.id,
                url=ranked.candidate.url,
                normalized_url=ranked.normalized_url,
                title=ranked.candidate.title,
                authority_score=ranked.authority,
                published_at=ranked.candidate.published_at,
                fetched_at=datetime.now(timezone.utc),
                raw_text=ranked.candidate.raw_content,
            )
        )

    for img in stored_images:
        session.add(
            Image(
                finding_id=finding.id,
                origin_url=img.origin_url,
                stored_path=img.stored_path,
                mime=img.mime,
                attribution=img.attribution,
            )
        )

    await session.commit()
    await session.refresh(finding)
    return finding
