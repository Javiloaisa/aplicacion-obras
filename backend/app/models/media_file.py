import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MediaFile(Base):
    __tablename__ = "media_files"
    __table_args__ = (
        Index("ix_media_files_obra_uploaded", "obra_id", "uploaded_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    obra_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("obras.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    work_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("work_entries.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(
        Enum("photo", "video", name="media_kind", native_enum=False), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    thumbnail_path: Mapped[str | None] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    caption: Mapped[str | None] = mapped_column(Text)
