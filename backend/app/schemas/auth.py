from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.user import UserOut


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1)
    client: Literal["worker_app", "admin_panel"]


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


class MessageResponse(BaseModel):
    detail: str
