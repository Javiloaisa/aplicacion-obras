import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    full_name: str
    email: str | None
    phone: str | None
    role: Literal["admin", "worker"]
    is_active: bool
    must_change_password: bool
    created_at: datetime
