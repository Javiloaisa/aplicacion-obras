import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# Suggested trades for the UI. Stored as a free string so the list can grow
# without a migration; the frontend offers these as quick options.
TRADES = [
    "Albañil",
    "Fontanero",
    "Electricista",
    "Pintor",
    "Carpintero",
    "Encargado",
    "Peón",
    "Ferrallista",
    "Soldador",
    "Yesero/Escayolista",
    "Otros",
]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    full_name: str
    email: str | None
    phone: str | None
    trade: str | None = None
    role: Literal["admin", "worker"]
    is_active: bool
    must_change_password: bool
    created_at: datetime
    empresa_id: uuid.UUID | None = None
    acceso_todas_empresas: bool = False


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9._-]+$")
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=30)
    trade: str | None = Field(None, max_length=50)
    role: Literal["admin", "worker"] = "worker"
    # Mandatory for every new user: "todas" is only valid together with role=admin
    empresa: Literal["nido", "fega", "todas"]


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=30)
    trade: str | None = Field(None, max_length=50)
    role: Literal["admin", "worker"] | None = None
    is_active: bool | None = None
    # When true, a new temporary password is generated and returned once
    reset_password: bool = False
    # Admin-chosen password; takes priority over reset_password if both are sent
    new_password: str | None = Field(None, min_length=8, max_length=128)


class UserWithTempPassword(UserOut):
    temp_password: str | None = None


class PasswordReveal(BaseModel):
    # None when the account has no recoverable password (created before the feature)
    password: str | None = None


class AsignarEmpresaBody(BaseModel):
    """Bulk-classify one or more workers into an empresa (see app.services.empresas)."""

    user_ids: list[uuid.UUID] = Field(min_length=1)
    empresa: Literal["nido", "fega"]


class MeEmpresaBody(BaseModel):
    """The single empresa an admin with access to both wants to keep."""

    empresa: Literal["nido", "fega"]
