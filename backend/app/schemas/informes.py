import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class HorasRow(BaseModel):
    obra_id: uuid.UUID
    obra_name: str
    user_id: uuid.UUID
    user_full_name: str
    trade: str | None = None
    total_hours: Decimal
    entry_count: int
    hourly_rate: Decimal | None = None
    cost: Decimal | None = None


class TradeHoursRow(BaseModel):
    trade: str | None = None
    total_hours: Decimal
    cost: Decimal | None = None


class HorasReportOut(BaseModel):
    rows: list[HorasRow]
    by_trade: list[TradeHoursRow]
    total_hours: Decimal
    total_entries: int
    # None when no worker in the report has an hourly rate set
    total_cost: Decimal | None = None


class WorkerHoursRow(BaseModel):
    user_id: uuid.UUID
    user_full_name: str
    trade: str | None = None
    total_hours: Decimal
    entry_count: int
    hourly_rate: Decimal | None = None
    cost: Decimal | None = None


class ObraResumenOut(BaseModel):
    obra_id: uuid.UUID
    obra_name: str
    workers: list[WorkerHoursRow]
    by_trade: list[TradeHoursRow]
    total_hours: Decimal
    total_cost: Decimal | None = None
    photo_count: int
    video_count: int
    first_entry_date: date | None
    last_entry_date: date | None
