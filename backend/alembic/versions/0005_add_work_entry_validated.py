"""add validated flag to work_entries

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "work_entries",
        sa.Column(
            "validated", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )
    op.alter_column("work_entries", "validated", server_default=None)


def downgrade() -> None:
    op.drop_column("work_entries", "validated")
