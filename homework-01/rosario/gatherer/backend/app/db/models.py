"""ORM models for the Topic -> Finding/Digest data model (CLAUDE.md §2).

Exactly two levels: Topic -> Finding. Each Finding owns its Digest(s) (versioned),
Sources, Images, and a read-state row.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class Topic(Base):
    __tablename__ = "topic"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    schedule_cron: Mapped[str | None] = mapped_column(String, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    findings: Mapped[list["Finding"]] = relationship(
        back_populates="topic", cascade="all, delete-orphan"
    )
    runs: Mapped[list["Run"]] = relationship(
        back_populates="topic", cascade="all, delete-orphan"
    )


class Run(Base):
    __tablename__ = "run"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    topic_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("topic.id", ondelete="CASCADE"), index=True, nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String, default="running", nullable=False)
    stats: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    topic: Mapped[Topic] = relationship(back_populates="runs")


class Finding(Base):
    __tablename__ = "finding"
    __table_args__ = (UniqueConstraint("topic_id", "slug", name="uq_finding_topic_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    topic_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("topic.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="new", nullable=False)  # new|updated|stable
    first_seen_run: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("run.id"), nullable=True
    )
    last_seen_run: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("run.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    topic: Mapped[Topic] = relationship(back_populates="findings")
    digests: Mapped[list["Digest"]] = relationship(
        back_populates="finding", cascade="all, delete-orphan"
    )
    sources: Mapped[list["Source"]] = relationship(
        back_populates="finding", cascade="all, delete-orphan"
    )
    images: Mapped[list["Image"]] = relationship(
        back_populates="finding", cascade="all, delete-orphan"
    )
    read_state: Mapped["ReadState | None"] = relationship(
        back_populates="finding", cascade="all, delete-orphan", uselist=False
    )


class Digest(Base):
    """LLM output for a finding. Versioned: is_current flags the latest (ARCHITECTURE §9)."""

    __tablename__ = "digest"
    # At most one current digest per finding — the read side relies on this.
    __table_args__ = (
        Index(
            "uq_digest_one_current",
            "finding_id",
            unique=True,
            postgresql_where=text("is_current"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    finding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("finding.id", ondelete="CASCADE"), index=True, nullable=False
    )
    run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("run.id"), nullable=True)

    # The four required sections, stored discretely (CLAUDE.md §6 coupling).
    what_changed: Mapped[str] = mapped_column(Text, default="")
    why_it_matters: Mapped[str] = mapped_column(Text, default="")
    technical_details: Mapped[str] = mapped_column(Text, default="")
    sources_md: Mapped[str] = mapped_column(Text, default="")
    body_md: Mapped[str] = mapped_column(Text, default="")  # assembled render cache

    model: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    finding: Mapped[Finding] = relationship(back_populates="digests")


class Source(Base):
    __tablename__ = "source"
    __table_args__ = (
        UniqueConstraint("finding_id", "normalized_url", name="uq_source_finding_url"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    finding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("finding.id", ondelete="CASCADE"), index=True, nullable=False
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    authority_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    finding: Mapped[Finding] = relationship(back_populates="sources")


class Image(Base):
    __tablename__ = "image"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    finding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("finding.id", ondelete="CASCADE"), index=True, nullable=False
    )
    source_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("source.id"), nullable=True)
    origin_url: Mapped[str] = mapped_column(Text, nullable=False)
    stored_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime: Mapped[str | None] = mapped_column(String, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attribution: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    finding: Mapped[Finding] = relationship(back_populates="images")


class ReadState(Base):
    __tablename__ = "read_state"

    finding_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("finding.id", ondelete="CASCADE"), primary_key=True
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    finding: Mapped[Finding] = relationship(back_populates="read_state")
