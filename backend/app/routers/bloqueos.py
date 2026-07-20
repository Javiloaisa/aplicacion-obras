import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_admin
from app.models import BlockedDay, User
from app.schemas.blocked_day import BlockedDayOut, BlockedDaysCreate

router = APIRouter(prefix="/bloqueos", tags=["bloqueos"])


@router.get("", response_model=list[BlockedDayOut])
def list_bloqueos(
    user_id: uuid.UUID | None = None,
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = (
        select(BlockedDay, User.full_name)
        .join(User, User.id == BlockedDay.user_id)
        .order_by(BlockedDay.blocked_date.desc(), User.full_name)
    )
    if user_id is not None:
        stmt = stmt.where(BlockedDay.user_id == user_id)
    if from_date is not None:
        stmt = stmt.where(BlockedDay.blocked_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(BlockedDay.blocked_date <= to_date)

    return [
        _bloqueo_out(blocked, full_name) for blocked, full_name in db.execute(stmt).all()
    ]


@router.post("", response_model=list[BlockedDayOut], status_code=status.HTTP_201_CREATED)
def create_bloqueos(
    body: BlockedDaysCreate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Block one date for several workers at once. Already-blocked pairs are skipped."""
    users = db.scalars(select(User).where(User.id.in_(body.user_ids))).all()
    if len(users) != len(set(body.user_ids)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alguno de los trabajadores no existe",
        )

    already_blocked = set(
        db.scalars(
            select(BlockedDay.user_id).where(
                BlockedDay.blocked_date == body.blocked_date,
                BlockedDay.user_id.in_(body.user_ids),
            )
        )
    )

    created: list[BlockedDayOut] = []
    for user in users:
        if user.id in already_blocked:
            continue
        blocked = BlockedDay(
            user_id=user.id, blocked_date=body.blocked_date, note=body.note
        )
        db.add(blocked)
        db.flush()
        created.append(_bloqueo_out(blocked, user.full_name))
    db.commit()
    return created


@router.delete("/{bloqueo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bloqueo(
    bloqueo_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    blocked = db.get(BlockedDay, bloqueo_id)
    if blocked is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Bloqueo no encontrado"
        )
    db.delete(blocked)
    db.commit()


def _bloqueo_out(blocked: BlockedDay, user_full_name: str | None) -> BlockedDayOut:
    out = BlockedDayOut.model_validate(blocked)
    out.user_full_name = user_full_name
    return out
