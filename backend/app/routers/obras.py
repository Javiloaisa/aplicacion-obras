import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import (
    EmpresaScope,
    ensure_obra_access,
    get_current_user,
    get_db,
    get_obra_or_404,
    require_admin,
    scope_empresa,
)
from app.models import Empresa, MediaFile, Obra, User, WorkEntry
from app.schemas.obra import (
    ObraCreate,
    ObraDetailOut,
    ObraEmpresasBody,
    ObraOut,
    ObrasAsignarEmpresasBody,
    ObraUpdate,
)

router = APIRouter(prefix="/obras", tags=["obras"])


def _set_obra_empresas(db: Session, obra: Obra, slugs: list[str]) -> None:
    if not slugs:
        obra.empresas = []
        return
    obra.empresas = list(db.scalars(select(Empresa).where(Empresa.slug.in_(slugs))).all())


@router.get("", response_model=list[ObraOut])
def list_obras(
    status_filter: Literal["active", "archived"] | None = Query(None, alias="status"),
    user: User = Depends(get_current_user),
    scope: EmpresaScope = Depends(scope_empresa),
    db: Session = Depends(get_db),
):
    stmt = select(Obra).order_by(Obra.created_at.desc())
    stmt = scope.filter_obras(stmt)
    if user.role == "admin":
        if status_filter is not None:
            stmt = stmt.where(Obra.status == status_filter)
    else:
        # Workers pick any active obra — there is no assignment concept
        stmt = stmt.where(Obra.status == "active")
    return db.scalars(stmt).all()


@router.post("", response_model=ObraOut, status_code=status.HTTP_201_CREATED)
def create_obra(
    body: ObraCreate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    obra = Obra(**body.model_dump())
    db.add(obra)
    db.commit()
    return obra


@router.get("/{obra_id}", response_model=ObraDetailOut)
def get_obra(
    obra_id: uuid.UUID,
    user: User = Depends(get_current_user),
    scope: EmpresaScope = Depends(scope_empresa),
    db: Session = Depends(get_db),
):
    obra = get_obra_or_404(db, obra_id)
    ensure_obra_access(db, obra, user, scope)

    photo_count = db.scalar(
        select(func.count()).where(
            MediaFile.obra_id == obra.id, MediaFile.kind == "photo"
        )
    )
    video_count = db.scalar(
        select(func.count()).where(
            MediaFile.obra_id == obra.id, MediaFile.kind == "video"
        )
    )
    total_hours = db.scalar(
        select(func.coalesce(func.sum(WorkEntry.hours), 0)).where(
            WorkEntry.obra_id == obra.id
        )
    )

    return ObraDetailOut(
        **ObraOut.model_validate(obra).model_dump(),
        photo_count=photo_count,
        video_count=video_count,
        total_hours=Decimal(str(total_hours)),
    )


@router.patch("/{obra_id}", response_model=ObraOut)
def update_obra(
    obra_id: uuid.UUID,
    body: ObraUpdate,
    admin: User = Depends(require_admin),
    scope: EmpresaScope = Depends(scope_empresa),
    db: Session = Depends(get_db),
):
    obra = get_obra_or_404(db, obra_id)
    ensure_obra_access(db, obra, admin, scope)
    data = body.model_dump(exclude_unset=True)
    new_status = data.pop("status", None)
    for field, value in data.items():
        setattr(obra, field, value)
    if new_status is not None and new_status != obra.status:
        obra.status = new_status
        obra.archived_at = (
            datetime.now(timezone.utc) if new_status == "archived" else None
        )
    db.add(obra)
    db.commit()
    return obra


@router.put("/{obra_id}/empresas", response_model=ObraOut)
def set_obra_empresas(
    obra_id: uuid.UUID,
    body: ObraEmpresasBody,
    admin: User = Depends(require_admin),
    scope: EmpresaScope = Depends(scope_empresa),
    db: Session = Depends(get_db),
):
    """Replace the full set of empresas an obra is assigned to ([] = sin asignar)."""
    obra = get_obra_or_404(db, obra_id)
    ensure_obra_access(db, obra, admin, scope)
    _set_obra_empresas(db, obra, body.empresas)
    db.commit()
    db.refresh(obra)
    return obra


@router.post("/asignar-empresas", response_model=list[ObraOut])
def asignar_empresas_obras(
    body: ObrasAsignarEmpresasBody,
    admin: User = Depends(require_admin),
    scope: EmpresaScope = Depends(scope_empresa),
    db: Session = Depends(get_db),
):
    """Same replacement as set_obra_empresas, applied to several obras at once."""
    obras = db.scalars(select(Obra).where(Obra.id.in_(body.obra_ids))).all()
    if len(obras) != len(set(body.obra_ids)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Alguna de las obras no existe"
        )
    for obra in obras:
        ensure_obra_access(db, obra, admin, scope)
    for obra in obras:
        _set_obra_empresas(db, obra, body.empresas)
    db.commit()
    for obra in obras:
        db.refresh(obra)
    return obras
