import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class MediaOut(BaseModel):
    id: uuid.UUID
    obra_id: uuid.UUID
    user_id: uuid.UUID
    user_full_name: str | None = None
    work_entry_id: uuid.UUID | None
    kind: Literal["photo", "video"]
    original_filename: str
    mime_type: str
    size_bytes: int
    duration_seconds: int | None
    taken_at: datetime | None
    uploaded_at: datetime
    caption: str | None
    file_url: str
    thumb_url: str | None


class MediaUpdate(BaseModel):
    caption: str | None = Field(None, max_length=500)


class MediaListOut(BaseModel):
    items: list[MediaOut]
    total: int
    page: int
    page_size: int
    pages: int
