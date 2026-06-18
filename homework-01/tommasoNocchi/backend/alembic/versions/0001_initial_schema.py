"""initial_schema

Revision ID: 0001
Revises:
Create Date: 2026-06-15 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum("patient", "doctor", name="userrole"), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(512), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_refresh_tokens_token", "refresh_tokens", ["token"])

    op.create_table(
        "specialties",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "doctors",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("specialty_id", sa.Integer(), nullable=False),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("license_number", sa.String(100), nullable=True),
        sa.Column("years_experience", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["specialty_id"], ["specialties.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    op.create_table(
        "patients",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("blood_type", sa.String(10), nullable=True),
        sa.Column("allergies", sa.Text(), nullable=True),
        sa.Column("fiscal_code", sa.String(20), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    op.create_table(
        "slots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("start_datetime", sa.DateTime(), nullable=False),
        sa.Column("end_datetime", sa.DateTime(), nullable=False),
        sa.Column("slot_type", sa.Enum("visit", "procedure", name="slottype"), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "appointments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("slot_id", sa.Integer(), nullable=False),
        sa.Column("appointment_type", sa.Enum("visit", "procedure", name="appointmenttype"), nullable=False),
        sa.Column("status", sa.Enum("scheduled", "completed", "cancelled", "no_show", name="appointmentstatus"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("cancelled_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["cancelled_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"]),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["slot_id"], ["slots.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slot_id"),
    )

    op.create_table(
        "medical_record_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("appointment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("specialty_id", sa.Integer(), nullable=False),
        sa.Column("entry_date", sa.DateTime(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("attachments", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by_doctor_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"]),
        sa.ForeignKeyConstraint(["created_by_doctor_id"], ["doctors.id"]),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"]),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["specialty_id"], ["specialties.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("appointment_id"),
    )


def downgrade() -> None:
    op.drop_table("medical_record_entries")
    op.drop_table("appointments")
    op.drop_table("slots")
    op.drop_table("patients")
    op.drop_table("doctors")
    op.drop_table("specialties")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS userrole")
    op.execute("DROP TYPE IF EXISTS slottype")
    op.execute("DROP TYPE IF EXISTS appointmenttype")
    op.execute("DROP TYPE IF EXISTS appointmentstatus")
