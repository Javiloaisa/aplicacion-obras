import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        # acceso_todas_empresas is only meaningful for admins
        CheckConstraint(
            "acceso_todas_empresas = false OR role = 'admin'",
            name="todas_empresas_admin_only",
        ),
        # An admin with access to both companies has no single empresa_id —
        # that combination is what distinguishes them from an unassigned user
        CheckConstraint(
            "NOT acceso_todas_empresas OR empresa_id IS NULL",
            name="todas_empresas_sin_empresa",
        ),
        # Unlike workers, admins are never left "pending": they always have
        # either one empresa or access to both
        CheckConstraint(
            "role != 'admin' OR empresa_id IS NOT NULL OR acceso_todas_empresas",
            name="admin_scope_obligatorio",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(30))
    # Trade/speciality (albañil, fontanero, electricista...), free string
    trade: Mapped[str | None] = mapped_column(String(50))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Reversible-encrypted copy of the current password so an admin can look it up
    # when a worker forgets it. Null for accounts created before this feature.
    password_enc: Mapped[str | None] = mapped_column(String(512))
    role: Mapped[str] = mapped_column(
        Enum("admin", "worker", name="user_role", native_enum=False),
        nullable=False,
        default="worker",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # NULL = pending classification (workers only; see todas_empresas checks above)
    empresa_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("empresas.id"), index=True
    )
    acceso_todas_empresas: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
