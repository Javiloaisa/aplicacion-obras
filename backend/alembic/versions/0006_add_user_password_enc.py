"""add encrypted password copy to users

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_enc", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_enc")
