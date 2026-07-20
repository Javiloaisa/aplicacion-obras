import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BlockedDay(Base):
    """A date on which a worker is not allowed to file work entries.

    Created by the admin (e.g. the worker did not show up that day) to stop
    backdated partes being filed for days not actually worked.
    """

    __tablename__ = "blocked_days"
    __table_args__ = (
        UniqueConstraint("user_id", "blocked_date", name="uq_blocked_days_user_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    blocked_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
