import uuid
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class WorkEntryCreate(BaseModel):
    work_date: date
    start_time: time | None = None
    end_time: time | None = None
    hours: Decimal | None = None
    notes: str | None = Field(None, max_length=1000)
    # Only honoured for admins (create an entry on behalf of a worker)
    user_id: uuid.UUID | None = None


class WorkEntryUpdate(BaseModel):
    work_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    hours: Decimal | None = None
    notes: str | None = Field(None, max_length=1000)


class WorkEntryValidate(BaseModel):
    validated: bool


class WorkEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    obra_id: uuid.UUID
    user_id: uuid.UUID
    work_date: date
    start_time: time | None
    end_time: time | None
    hours: Decimal
    notes: str | None
    created_at: datetime
    updated_at: datetime
    edited_by_admin: bool
    validated: bool
    user_full_name: str | None = None
    obra_name: str | None = None


class EntriesListOut(BaseModel):
    items: list[WorkEntryOut]
    count: int
    total_hours: Decimal
