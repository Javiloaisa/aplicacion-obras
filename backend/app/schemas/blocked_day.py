import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_DATES_PER_REQUEST = 366


class BlockedDaysCreate(BaseModel):
    """Block one or more dates for several workers at once.

    Accepts either a single `blocked_date` or a list of `blocked_dates`.
    """

    blocked_date: date | None = None
    blocked_dates: list[date] | None = None
    user_ids: list[uuid.UUID] = Field(min_length=1)
    note: str | None = Field(None, max_length=200)

    @model_validator(mode="after")
    def _normalize_dates(self):
        dates = set(self.blocked_dates or [])
        if self.blocked_date is not None:
            dates.add(self.blocked_date)
        if not dates:
            raise ValueError("Indica al menos una fecha")
        if len(dates) > MAX_DATES_PER_REQUEST:
            raise ValueError(
                f"Demasiadas fechas (máximo {MAX_DATES_PER_REQUEST} por petición)"
            )
        self.blocked_dates = sorted(dates)
        return self

    @property
    def dates(self) -> list[date]:
        return self.blocked_dates or []


class BlockedDayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    blocked_date: date
    note: str | None
    created_at: datetime
    user_full_name: str | None = None
