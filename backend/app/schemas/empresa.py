import uuid

from pydantic import BaseModel, ConfigDict


class EmpresaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    slug: str


class PendientesOut(BaseModel):
    trabajadores: int
    obras: int
