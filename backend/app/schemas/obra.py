import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    # Empresa slugs this obra is assigned to; empty means "sin asignar"
    empresas: list[str] = []

    @field_validator("empresas", mode="before")
    @classmethod
    def _empresa_slugs(cls, v):
        return [e.slug if hasattr(e, "slug") else e for e in v]


class ObraDetailOut(ObraOut):
    photo_count: int
    video_count: int
    total_hours: Decimal


class ObraEmpresasBody(BaseModel):
    """Full replacement set of empresas for one obra; [] means "sin asignar"."""

    empresas: list[Literal["nido", "fega"]] = []


class ObrasAsignarEmpresasBody(BaseModel):
    """Same replacement, applied to several obras at once."""

    obra_ids: list[uuid.UUID] = Field(min_length=1)
    empresas: list[Literal["nido", "fega"]] = []
