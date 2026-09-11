import uuid

from sqlalchemy import Column, ForeignKey, String, Table, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Plain association table (no extra columns) for the obra <-> empresa
# many-to-many. Deleting an obra drops its rows here; empresas are not
# expected to be deleted so no cascade is defined on that side.
obra_empresas = Table(
    "obra_empresas",
    Base.metadata,
    Column("obra_id", Uuid, ForeignKey("obras.id", ondelete="CASCADE"), primary_key=True),
    Column("empresa_id", Uuid, ForeignKey("empresas.id"), primary_key=True),
)


class Empresa(Base):
    __tablename__ = "empresas"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
