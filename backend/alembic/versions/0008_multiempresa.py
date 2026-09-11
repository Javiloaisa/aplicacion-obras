"""add multi-empresa support (empresas, obra_empresas, empresa_id on users/work_entries/media_files)

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-11

Transition design: empresa_id is nullable on users/work_entries/media_files
(NULL = "pending classification"), obra_empresas starts empty (an obra with
no rows there is unassigned/visible to everyone), and no existing data is
backfilled — the admin classifies it by hand from the panel. The one
exception: every admin that exists today is set to
acceso_todas_empresas=True (empresa_id stays NULL) so nobody loses access to
the panel on deploy.
"""
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NIDO_ID = str(uuid4())
FEGA_ID = str(uuid4())


def upgrade() -> None:
    empresas = op.create_table(
        "empresas",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=30), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_empresas"),
        sa.UniqueConstraint("slug", name="uq_empresas_slug"),
    )
    op.bulk_insert(
        empresas,
        [
            {"id": NIDO_ID, "nombre": "Nido Constructions", "slug": "nido"},
            {"id": FEGA_ID, "nombre": "Fega Juan", "slug": "fega"},
        ],
    )

    op.create_table(
        "obra_empresas",
        sa.Column("obra_id", sa.Uuid(), nullable=False),
        sa.Column("empresa_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["obra_id"], ["obras.id"], name="fk_obra_empresas_obra_id_obras", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["empresa_id"], ["empresas.id"], name="fk_obra_empresas_empresa_id_empresas"
        ),
        sa.PrimaryKeyConstraint("obra_id", "empresa_id", name="pk_obra_empresas"),
    )

    op.add_column("users", sa.Column("empresa_id", sa.Uuid(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "acceso_todas_empresas", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.create_index("ix_users_empresa_id", "users", ["empresa_id"])
    op.create_foreign_key(
        "fk_users_empresa_id_empresas", "users", "empresas", ["empresa_id"], ["id"]
    )

    # Every admin that exists today gets acceso_todas_empresas so deploying
    # this migration never locks anyone out of the panel. Must run before the
    # CHECK constraints below, which require every admin to already have a scope.
    op.execute("UPDATE users SET acceso_todas_empresas = true WHERE role = 'admin'")

    # Passing the short name (matching the model's CheckConstraint(name=...))
    # lets Base.metadata's naming convention add the "ck_users_" prefix, so the
    # resulting constraint name matches what SQLAlchemy expects from the model.
    op.create_check_constraint(
        "todas_empresas_admin_only",
        "users",
        "acceso_todas_empresas = false OR role = 'admin'",
    )
    op.create_check_constraint(
        "todas_empresas_sin_empresa",
        "users",
        "NOT acceso_todas_empresas OR empresa_id IS NULL",
    )
    op.create_check_constraint(
        "admin_scope_obligatorio",
        "users",
        "role != 'admin' OR empresa_id IS NOT NULL OR acceso_todas_empresas",
    )

    op.add_column("work_entries", sa.Column("empresa_id", sa.Uuid(), nullable=True))
    op.create_index("ix_work_entries_empresa_id", "work_entries", ["empresa_id"])
    op.create_foreign_key(
        "fk_work_entries_empresa_id_empresas",
        "work_entries",
        "empresas",
        ["empresa_id"],
        ["id"],
    )

    op.add_column("media_files", sa.Column("empresa_id", sa.Uuid(), nullable=True))
    op.create_index("ix_media_files_empresa_id", "media_files", ["empresa_id"])
    op.create_foreign_key(
        "fk_media_files_empresa_id_empresas",
        "media_files",
        "empresas",
        ["empresa_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_media_files_empresa_id_empresas", "media_files", type_="foreignkey")
    op.drop_index("ix_media_files_empresa_id", table_name="media_files")
    op.drop_column("media_files", "empresa_id")

    op.drop_constraint("fk_work_entries_empresa_id_empresas", "work_entries", type_="foreignkey")
    op.drop_index("ix_work_entries_empresa_id", table_name="work_entries")
    op.drop_column("work_entries", "empresa_id")

    # Short names here too: op.drop_constraint(type_="check") re-applies the
    # naming convention just like create_check_constraint above.
    op.drop_constraint("admin_scope_obligatorio", "users", type_="check")
    op.drop_constraint("todas_empresas_sin_empresa", "users", type_="check")
    op.drop_constraint("todas_empresas_admin_only", "users", type_="check")
    op.drop_constraint("fk_users_empresa_id_empresas", "users", type_="foreignkey")
    op.drop_index("ix_users_empresa_id", table_name="users")
    op.drop_column("users", "acceso_todas_empresas")
    op.drop_column("users", "empresa_id")

    op.drop_table("obra_empresas")
    op.drop_table("empresas")
