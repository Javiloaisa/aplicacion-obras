import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    Time,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WorkEntry(Base):
    __tablename__ = "work_entries"
    __table_args__ = (
        CheckConstraint("hours >= 0.25 AND hours <= 16", name="hours_range"),
        Index("ix_work_entries_obra_date", "obra_id", "work_date"),
        Index("ix_work_entries_user_date", "user_id", "work_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    obra_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("obras.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    hours: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    edited_by_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    validated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
