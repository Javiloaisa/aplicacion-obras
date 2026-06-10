import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ObraCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    client_name: str | None = Field(None, max_length=200)
    address: str | None = Field(None, max_length=300)
    description: str | None = Field(None, max_length=2000)


class ObraUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    client_name: str | None = Field(None, max_length=200)
    address: str | None = Field(None, max_length=300)
    description: str | None = Field(None, max_length=2000)
    status: Literal["active", "archived"] | None = None


class ObraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    client_name: str | None
    address: str | None
    description: str | None
    status: Literal["active", "archived"]
    created_at: datetime
    archived_at: datetime | None


class ObraDetailOut(ObraOut):
    photo_count: int
    video_count: int
    total_hours: Decimal


class AssignmentsUpdate(BaseModel):
    add: list[uuid.UUID] = []
    remove: list[uuid.UUID] = []
