import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class HorasRow(BaseModel):
    obra_id: uuid.UUID
    obra_name: str
    user_id: uuid.UUID
    user_full_name: str
    total_hours: Decimal
    entry_count: int


class HorasReportOut(BaseModel):
    rows: list[HorasRow]
    total_hours: Decimal
    total_entries: int


class WorkerHoursRow(BaseModel):
    user_id: uuid.UUID
    user_full_name: str
    total_hours: Decimal
    entry_count: int


class ObraResumenOut(BaseModel):
    obra_id: uuid.UUID
    obra_name: str
    workers: list[WorkerHoursRow]
    total_hours: Decimal
    photo_count: int
    video_count: int
    first_entry_date: date | None
    last_entry_date: date | None
