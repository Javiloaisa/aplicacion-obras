"""add trade and hourly_rate to users

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("trade", sa.String(length=50), nullable=True))
    op.add_column(
        "users",
        sa.Column("hourly_rate", sa.Numeric(precision=7, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "hourly_rate")
    op.drop_column("users", "trade")
