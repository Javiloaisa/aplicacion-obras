import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9._-]+$")
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=30)
    role: Literal["admin", "worker"] = "worker"


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=30)
    role: Literal["admin", "worker"] | None = None
    is_active: bool | None = None
    # When true, a new temporary password is generated and returned once
    reset_password: bool = False


class UserWithTempPassword(UserOut):
    temp_password: str | None = None
