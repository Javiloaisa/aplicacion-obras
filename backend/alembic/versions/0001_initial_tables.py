"""initial tables

Revision ID: 0001
Revises:
Create Date: 2026-06-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("admin", "worker", name="user_role", native_enum=False),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("must_change_password", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("username", name=op.f("uq_users_username")),
    )

    op.create_table(
        "obras",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("client_name", sa.String(length=200), nullable=True),
        sa.Column("address", sa.String(length=300), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("active", "archived", name="obra_status", native_enum=False),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_obras")),
    )

    op.create_table(
        "obra_assignments",
        sa.Column("obra_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["obra_id"],
            ["obras.id"],
            name=op.f("fk_obra_assignments_obra_id_obras"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_obra_assignments_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("obra_id", "user_id", name=op.f("pk_obra_assignments")),
    )

    op.create_table(
        "work_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("obra_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("hours", sa.Numeric(precision=4, scale=2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("edited_by_admin", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "hours >= 0.25 AND hours <= 16",
            name=op.f("ck_work_entries_hours_range"),
        ),
        sa.ForeignKeyConstraint(
            ["obra_id"],
            ["obras.id"],
            name=op.f("fk_work_entries_obra_id_obras"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_work_entries_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_work_entries")),
    )
    op.create_index(
        "ix_work_entries_obra_date", "work_entries", ["obra_id", "work_date"]
    )
    op.create_index(
        "ix_work_entries_user_date", "work_entries", ["user_id", "work_date"]
    )

    op.create_table(
        "media_files",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("obra_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("work_entry_id", sa.Uuid(), nullable=True),
        sa.Column(
            "kind",
            sa.Enum("photo", "video", name="media_kind", native_enum=False),
            nullable=False,
        ),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("thumbnail_path", sa.String(length=500), nullable=True),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["obra_id"],
            ["obras.id"],
            name=op.f("fk_media_files_obra_id_obras"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_media_files_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["work_entry_id"],
            ["work_entries.id"],
            name=op.f("fk_media_files_work_entry_id_work_entries"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_media_files")),
    )
    op.create_index(
        "ix_media_files_obra_uploaded", "media_files", ["obra_id", "uploaded_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_media_files_obra_uploaded", table_name="media_files")
    op.drop_table("media_files")
    op.drop_index("ix_work_entries_user_date", table_name="work_entries")
    op.drop_index("ix_work_entries_obra_date", table_name="work_entries")
    op.drop_table("work_entries")
    op.drop_table("obra_assignments")
    op.drop_table("obras")
    op.drop_table("users")
