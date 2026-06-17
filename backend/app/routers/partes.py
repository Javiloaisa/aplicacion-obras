import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import (
    ensure_obra_access,
    get_current_user,
    get_db,
    get_obra_or_404,
    require_admin,
)
from app.models import Obra, User, WorkEntry
from app.schemas.work_entry import (
    EntriesListOut,
    WorkEntryCreate,
    WorkEntryOut,
    WorkEntryUpdate,
    WorkEntryValidate,
)
from app.utils import ensure_utc

router = APIRouter(tags=["partes"])

EDIT_WINDOW = timedelta(hours=48)
MIN_HOURS = Decimal("0.25")
MAX_HOURS = Decimal("16")
MAX_DAILY_HOURS = Decimal("24")


def _resolve_hours(start, end, hours) -> Decimal:
    """Compute hours from start/end when present; validate the allowed range."""
    if start is not None or end is not None:
        if start is None or end is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Indica hora de inicio y hora de fin",
            )
        if end <= start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="La hora de fin debe ser posterior a la de inicio",
            )
        seconds = (
            datetime.combine(date.min, end) - datetime.combine(date.min, start)
        ).total_seconds()
        hours = (Decimal(seconds) / Decimal(3600)).quantize(Decimal("0.01"))
    if hours is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Indica las horas trabajadas o el horario de inicio y fin",
        )
    hours = Decimal(hours).quantize(Decimal("0.01"))
    if hours < MIN_HOURS or hours > MAX_HOURS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Las horas deben estar entre 0.25 y 16 por parte",
        )
    return hours


def _check_daily_cap(
    db: Session,
    user_id: uuid.UUID,
    work_date: date,
    new_hours: Decimal,
    exclude_id: uuid.UUID | None = None,
) -> None:
    stmt = select(func.coalesce(func.sum(WorkEntry.hours), 0)).where(
        WorkEntry.user_id == user_id, WorkEntry.work_date == work_date
    )
    if exclude_id is not None:
        stmt = stmt.where(WorkEntry.id != exclude_id)
    existing = Decimal(str(db.scalar(stmt)))
    if existing + new_hours > MAX_DAILY_HOURS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Máximo 24 horas por trabajador y día",
        )


def _can_modify(entry: WorkEntry, user: User) -> None:
    if user.role == "admin":
        return
    if entry.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes modificar partes de otros trabajadores",
        )
    age = datetime.now(timezone.utc) - ensure_utc(entry.created_at)
    if age > EDIT_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes modificar un parte durante las 48 horas siguientes",
        )


@router.post(
    "/obras/{obra_id}/entries",
    response_model=WorkEntryOut,
    status_code=status.HTTP_201_CREATED,
)
def create_entry(
    obra_id: uuid.UUID,
    body: WorkEntryCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obra = get_obra_or_404(db, obra_id)
    ensure_obra_access(db, obra, user)

    target_user_id = user.id
    if body.user_id is not None and body.user_id != user.id:
        if user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes crear partes para otros trabajadores",
            )
        if db.get(User, body.user_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado",
            )
        target_user_id = body.user_id

    hours = _resolve_hours(body.start_time, body.end_time, body.hours)
    _check_daily_cap(db, target_user_id, body.work_date, hours)

    entry = WorkEntry(
        obra_id=obra.id,
        user_id=target_user_id,
        work_date=body.work_date,
        start_time=body.start_time,
        end_time=body.end_time,
        hours=hours,
        notes=body.notes,
    )
    db.add(entry)
    db.commit()
    return entry


@router.get("/obras/{obra_id}/entries", response_model=EntriesListOut)
def list_obra_entries(
    obra_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obra = get_obra_or_404(db, obra_id)
    ensure_obra_access(db, obra, user)

    stmt = (
        select(WorkEntry, User.full_name)
        .join(User, User.id == WorkEntry.user_id)
        .where(WorkEntry.obra_id == obra.id)
        .order_by(WorkEntry.work_date.desc(), WorkEntry.created_at.desc())
    )
    if user.role != "admin":
        stmt = stmt.where(WorkEntry.user_id == user.id)
    elif user_id is not None:
        stmt = stmt.where(WorkEntry.user_id == user_id)
    if from_date is not None:
        stmt = stmt.where(WorkEntry.work_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(WorkEntry.work_date <= to_date)

    rows = db.execute(stmt).all()
    items = [
        _entry_out(entry, user_full_name=full_name, obra_name=obra.name)
        for entry, full_name in rows
    ]
    total = sum((item.hours for item in items), Decimal("0"))
    return EntriesListOut(items=items, count=len(items), total_hours=total)


def _entry_out(entry: WorkEntry, *, user_full_name=None, obra_name=None) -> WorkEntryOut:
    out = WorkEntryOut.model_validate(entry)
    out.user_full_name = user_full_name
    out.obra_name = obra_name
    return out


@router.get("/entries/mine", response_model=EntriesListOut)
def my_entries(
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(WorkEntry, Obra.name)
        .join(Obra, Obra.id == WorkEntry.obra_id)
        .where(WorkEntry.user_id == user.id)
        .order_by(WorkEntry.work_date.desc(), WorkEntry.created_at.desc())
    )
    if from_date is not None:
        stmt = stmt.where(WorkEntry.work_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(WorkEntry.work_date <= to_date)

    rows = db.execute(stmt).all()
    items = [
        _entry_out(entry, user_full_name=user.full_name, obra_name=obra_name)
        for entry, obra_name in rows
    ]
    total = sum((item.hours for item in items), Decimal("0"))
    return EntriesListOut(items=items, count=len(items), total_hours=total)


@router.patch("/entries/{entry_id}", response_model=WorkEntryOut)
def update_entry(
    entry_id: uuid.UUID,
    body: WorkEntryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.get(WorkEntry, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Parte no encontrado"
        )
    _can_modify(entry, user)

    data = body.model_dump(exclude_unset=True)
    if "obra_id" in data:
        if user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el administrador puede cambiar la obra de un parte",
            )
        new_obra = get_obra_or_404(db, data["obra_id"])
        entry.obra_id = new_obra.id
    if "work_date" in data:
        entry.work_date = data["work_date"]
    if "notes" in data:
        entry.notes = data["notes"]

    if "start_time" in data or "end_time" in data:
        start = data.get("start_time", entry.start_time)
        end = data.get("end_time", entry.end_time)
        entry.hours = _resolve_hours(start, end, None)
        entry.start_time = start
        entry.end_time = end
    elif "hours" in data:
        # Manual hours: drop any previous start/end so data stays consistent
        entry.hours = _resolve_hours(None, None, data["hours"])
        entry.start_time = None
        entry.end_time = None

    _check_daily_cap(db, entry.user_id, entry.work_date, entry.hours, exclude_id=entry.id)

    if user.role == "admin":
        entry.edited_by_admin = True
    # A change to the worked data invalidates a previous validation
    if data.keys() - {"notes"}:
        entry.validated = False
    db.add(entry)
    db.commit()
    return entry


@router.patch("/entries/{entry_id}/validate", response_model=WorkEntryOut)
def validate_entry(
    entry_id: uuid.UUID,
    body: WorkEntryValidate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    entry = db.get(WorkEntry, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Parte no encontrado"
        )
    entry.validated = body.validated
    db.add(entry)
    db.commit()
    return entry


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.get(WorkEntry, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Parte no encontrado"
        )
    _can_modify(entry, user)
    db.delete(entry)
    db.commit()
