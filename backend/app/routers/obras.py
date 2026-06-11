import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import (
    ensure_obra_access,
    get_current_user,
    get_db,
    get_obra_or_404,
    require_admin,
)
from app.models import MediaFile, Obra, User, WorkEntry
from app.schemas.obra import (
    ObraCreate,
    ObraDetailOut,
    ObraOut,
    ObraUpdate,
)

router = APIRouter(prefix="/obras", tags=["obras"])


@router.get("", response_model=list[ObraOut])
def list_obras(
    status_filter: Literal["active", "archived"] | None = Query(None, alias="status"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Obra).order_by(Obra.created_at.desc())
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
    db: Session = Depends(get_db),
):
    obra = get_obra_or_404(db, obra_id)
    ensure_obra_access(db, obra, user)

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
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    obra = get_obra_or_404(db, obra_id)
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
