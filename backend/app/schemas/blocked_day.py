import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class BlockedDaysCreate(BaseModel):
    blocked_date: date
    user_ids: list[uuid.UUID] = Field(min_length=1)
    note: str | None = Field(None, max_length=200)


class BlockedDayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    blocked_date: date
    note: str | None
    created_at: datetime
    user_full_name: str | None = None
