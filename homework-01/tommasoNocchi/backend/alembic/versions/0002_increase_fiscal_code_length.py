"""increase fiscal_code length

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-15 00:00:01.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("patients", "fiscal_code", type_=sa.String(50), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("patients", "fiscal_code", type_=sa.String(20), existing_nullable=True)
