from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import get_db, require_admin
from app.models import Empresa, Obra, User
from app.schemas.empresa import EmpresaOut, PendientesOut

router = APIRouter(prefix="/empresas", tags=["empresas"])


@router.get("", response_model=list[EmpresaOut])
def list_empresas(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.scalars(select(Empresa).order_by(Empresa.nombre)).all()


@router.get("/pendientes", response_model=PendientesOut)
def pendientes(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Global counts, not scoped: pending records are visible to every admin
    in scope already, regardless of which empresa they belong to."""
    trabajadores = db.scalar(
        select(func.count()).select_from(User).where(
            User.role == "worker", User.empresa_id.is_(None)
        )
    )
    obras = db.scalar(
        select(func.count()).select_from(Obra).where(~Obra.empresas.any())
    )
    return PendientesOut(trabajadores=trabajadores, obras=obras)
