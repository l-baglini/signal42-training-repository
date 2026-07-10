"""initial schema: topic, run, finding, digest, source, image, read_state

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()


def upgrade() -> None:
    op.create_table(
        "topic",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("schedule_cron", sa.String(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "run",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("topic_id", UUID, sa.ForeignKey("topic.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="running"),
        sa.Column("stats", JSONB, nullable=True),
    )
    op.create_index("ix_run_topic_id", "run", ["topic_id"])

    op.create_table(
        "finding",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("topic_id", UUID, sa.ForeignKey("topic.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="new"),
        sa.Column("first_seen_run", UUID, sa.ForeignKey("run.id"), nullable=True),
        sa.Column("last_seen_run", UUID, sa.ForeignKey("run.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("topic_id", "slug", name="uq_finding_topic_slug"),
    )
    op.create_index("ix_finding_topic_id", "finding", ["topic_id"])

    op.create_table(
        "digest",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("finding_id", UUID, sa.ForeignKey("finding.id", ondelete="CASCADE"), nullable=False),
        sa.Column("run_id", UUID, sa.ForeignKey("run.id"), nullable=True),
        sa.Column("what_changed", sa.Text(), server_default=""),
        sa.Column("why_it_matters", sa.Text(), server_default=""),
        sa.Column("technical_details", sa.Text(), server_default=""),
        sa.Column("sources_md", sa.Text(), server_default=""),
        sa.Column("body_md", sa.Text(), server_default=""),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_digest_finding_id", "digest", ["finding_id"])
    op.create_index("ix_digest_is_current", "digest", ["is_current"])
    # At most one current digest per finding (read side relies on this invariant).
    op.create_index(
        "uq_digest_one_current",
        "digest",
        ["finding_id"],
        unique=True,
        postgresql_where=sa.text("is_current"),
    )

    op.create_table(
        "source",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("finding_id", UUID, sa.ForeignKey("finding.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("normalized_url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("authority_score", sa.Numeric(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("raw_meta", JSONB, nullable=True),
        sa.UniqueConstraint("finding_id", "normalized_url", name="uq_source_finding_url"),
    )
    op.create_index("ix_source_finding_id", "source", ["finding_id"])

    op.create_table(
        "image",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("finding_id", UUID, sa.ForeignKey("finding.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_id", UUID, sa.ForeignKey("source.id"), nullable=True),
        sa.Column("origin_url", sa.Text(), nullable=False),
        sa.Column("stored_path", sa.Text(), nullable=True),
        sa.Column("mime", sa.String(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("attribution", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_image_finding_id", "image", ["finding_id"])

    op.create_table(
        "read_state",
        sa.Column("finding_id", UUID, sa.ForeignKey("finding.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("read_state")
    op.drop_index("ix_image_finding_id", table_name="image")
    op.drop_table("image")
    op.drop_index("ix_source_finding_id", table_name="source")
    op.drop_table("source")
    op.drop_index("uq_digest_one_current", table_name="digest")
    op.drop_index("ix_digest_is_current", table_name="digest")
    op.drop_index("ix_digest_finding_id", table_name="digest")
    op.drop_table("digest")
    op.drop_index("ix_finding_topic_id", table_name="finding")
    op.drop_table("finding")
    op.drop_index("ix_run_topic_id", table_name="run")
    op.drop_table("run")
    op.drop_table("topic")
