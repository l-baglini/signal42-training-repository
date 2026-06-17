"""Pydantic request/response models for the HTTP layer (the React<->Python contract)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TopicCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    schedule_cron: str | None = None


class TopicOut(BaseModel):
    id: uuid.UUID
    name: str
    schedule_cron: str | None
    active: bool
    unread_count: int = 0


class FindingSummary(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    is_read: bool
    latest_digest_at: datetime | None = None


class SourceOut(BaseModel):
    n: int
    title: str | None
    url: str
    published_at: datetime | None = None


class ImageOut(BaseModel):
    url: str          # backend-served route, never the origin
    attribution: str | None = None
    origin_url: str
    width: int | None = None
    height: int | None = None


class DigestOut(BaseModel):
    what_changed: str
    why_it_matters: str
    technical_details: str
    sources_md: str
    model: str
    created_at: datetime


class FindingDetail(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    is_read: bool
    digest: DigestOut | None
    sources: list[SourceOut]
    images: list[ImageOut]


class ReadUpdate(BaseModel):
    is_read: bool


class RunOut(BaseModel):
    id: uuid.UUID
    topic_id: uuid.UUID
    status: str
    started_at: datetime
    finished_at: datetime | None
    stats: dict | None


class RunTriggered(BaseModel):
    run_id: uuid.UUID
