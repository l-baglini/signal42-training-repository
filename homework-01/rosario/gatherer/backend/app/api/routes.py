"""HTTP routes — the React <-> Python contract (ARCHITECTURE.md §12)."""

from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app import scheduler
from app.api import schemas
from app.db import repositories as repo
from app.db.base import get_session
from app.db.models import Image
from app.modules.agent import _URL_RE  # reuse the URL extractor for source ordering
from app.modules.rank_dedup import normalize_url
from app.pipeline import trigger_run

router = APIRouter(prefix="/api")


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


# --- Topics -----------------------------------------------------------------


@router.get("/topics", response_model=list[schemas.TopicOut])
async def list_topics(session: AsyncSession = Depends(get_session)):
    rows = await repo.list_topics(session)
    return [
        schemas.TopicOut(
            id=t.id, name=t.name, schedule_cron=t.schedule_cron, active=t.active, unread_count=c
        )
        for t, c in rows
    ]


@router.post("/topics", response_model=schemas.TopicOut, status_code=201)
async def create_topic(body: schemas.TopicCreate, session: AsyncSession = Depends(get_session)):
    topic = await repo.create_topic(session, body.name, body.schedule_cron)
    scheduler.register_topic(topic.id, topic.schedule_cron)
    return schemas.TopicOut(
        id=topic.id, name=topic.name, schedule_cron=topic.schedule_cron, active=topic.active, unread_count=0
    )


@router.delete("/topics/{topic_id}", status_code=204)
async def delete_topic(topic_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    ok = await repo.delete_topic(session, topic_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Topic not found")
    scheduler.unregister_topic(topic_id)


@router.post("/topics/{topic_id}/run", response_model=schemas.RunTriggered)
async def run_topic(topic_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    topic = await repo.get_topic(session, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    run_id = await trigger_run(topic_id)
    return schemas.RunTriggered(run_id=run_id)


# --- Findings / digests -----------------------------------------------------


@router.get("/topics/{topic_id}/findings", response_model=list[schemas.FindingSummary])
async def list_findings(topic_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    rows = await repo.list_findings(session, topic_id)
    return [schemas.FindingSummary(**r) for r in rows]


@router.get("/findings/{finding_id}", response_model=schemas.FindingDetail)
async def get_finding(finding_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    detail = await repo.get_finding_detail(session, finding_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    finding = detail["finding"]
    digest = detail["digest"]

    # Order sources to match the [n] citations in the digest where possible.
    # Match on normalized URLs so trailing-slash / www / scheme differences align.
    cited = _URL_RE.findall(digest.sources_md) if digest else []
    order = {normalize_url(u): i for i, u in enumerate(cited)}
    sources = sorted(finding.sources, key=lambda s: order.get(s.normalized_url, 10_000))
    sources_out = [
        schemas.SourceOut(n=i + 1, title=s.title, url=s.url, published_at=s.published_at)
        for i, s in enumerate(sources)
    ]
    images_out = [
        schemas.ImageOut(
            url=f"/api/images/{img.id}",
            attribution=img.attribution,
            origin_url=img.origin_url,
            width=img.width,
            height=img.height,
        )
        for img in finding.images
        if img.stored_path
    ]
    digest_out = (
        schemas.DigestOut(
            what_changed=digest.what_changed,
            why_it_matters=digest.why_it_matters,
            technical_details=digest.technical_details,
            sources_md=digest.sources_md,
            model=digest.model,
            created_at=digest.created_at,
        )
        if digest
        else None
    )
    is_read = bool(finding.read_state.is_read) if finding.read_state else False
    return schemas.FindingDetail(
        id=finding.id,
        title=finding.title,
        status=finding.status,
        is_read=is_read,
        digest=digest_out,
        sources=sources_out,
        images=images_out,
    )


@router.patch("/findings/{finding_id}/read", status_code=204)
async def set_read(
    finding_id: uuid.UUID, body: schemas.ReadUpdate, session: AsyncSession = Depends(get_session)
):
    ok = await repo.set_read_state(session, finding_id, body.is_read)
    if not ok:
        raise HTTPException(status_code=404, detail="Finding not found")


# --- Runs & images ----------------------------------------------------------


@router.get("/runs/{run_id}", response_model=schemas.RunOut)
async def get_run(run_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    run = await repo.get_run(session, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return schemas.RunOut(
        id=run.id,
        topic_id=run.topic_id,
        status=run.status,
        started_at=run.started_at,
        finished_at=run.finished_at,
        stats=run.stats,
    )


@router.get("/images/{image_id}")
async def get_image(image_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    img = await session.get(Image, image_id)
    if img is None or not img.stored_path or not os.path.exists(img.stored_path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(img.stored_path, media_type=img.mime or "application/octet-stream")
