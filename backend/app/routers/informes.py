import csv
import io
import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import get_db, get_obra_or_404, require_admin
from app.models import MediaFile, Obra, User, WorkEntry
from app.schemas.informes import (
    HorasReportOut,
    HorasRow,
    ObraResumenOut,
    WorkerHoursRow,
)

router = APIRouter(prefix="/informes", tags=["informes"])


def _entries_filter(stmt, obra_id, user_id, from_date, to_date):
    if obra_id is not None:
        stmt = stmt.where(WorkEntry.obra_id == obra_id)
    if user_id is not None:
        stmt = stmt.where(WorkEntry.user_id == user_id)
    if from_date is not None:
        stmt = stmt.where(WorkEntry.work_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(WorkEntry.work_date <= to_date)
    return stmt


@router.get("/horas", response_model=HorasReportOut)
def horas_report(
    obra_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = (
        select(
            Obra.id,
            Obra.name,
            User.id,
            User.full_name,
            func.sum(WorkEntry.hours),
            func.count(WorkEntry.id),
        )
        .join(Obra, Obra.id == WorkEntry.obra_id)
        .join(User, User.id == WorkEntry.user_id)
        .group_by(Obra.id, Obra.name, User.id, User.full_name)
        .order_by(Obra.name, User.full_name)
    )
    stmt = _entries_filter(stmt, obra_id, user_id, from_date, to_date)

    rows = [
        HorasRow(
            obra_id=o_id,
            obra_name=o_name,
            user_id=u_id,
            user_full_name=u_name,
            total_hours=Decimal(str(hours)),
            entry_count=count,
        )
        for o_id, o_name, u_id, u_name, hours, count in db.execute(stmt).all()
    ]
    return HorasReportOut(
        rows=rows,
        total_hours=sum((r.total_hours for r in rows), Decimal("0")),
        total_entries=sum(r.entry_count for r in rows),
    )


@router.get("/horas/export.csv")
def horas_export_csv(
    obra_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = (
        select(WorkEntry, Obra.name, User.full_name)
        .join(Obra, Obra.id == WorkEntry.obra_id)
        .join(User, User.id == WorkEntry.user_id)
        .order_by(Obra.name, User.full_name, WorkEntry.work_date)
    )
    stmt = _entries_filter(stmt, obra_id, user_id, from_date, to_date)

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["obra", "trabajador", "fecha", "inicio", "fin", "horas", "notas"])
    for entry, obra_name, full_name in db.execute(stmt).all():
        writer.writerow(
            [
                obra_name,
                full_name,
                entry.work_date.isoformat(),
                entry.start_time.strftime("%H:%M") if entry.start_time else "",
                entry.end_time.strftime("%H:%M") if entry.end_time else "",
                str(entry.hours),
                entry.notes or "",
            ]
        )

    filename = "horas"
    if from_date is not None:
        filename += f"_{from_date.isoformat()}"
    if to_date is not None:
        filename += f"_{to_date.isoformat()}"
    # BOM so Excel (es-ES) opens the UTF-8 file with accents intact
    return Response(
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
    )


@router.get("/obra/{obra_id}/resumen", response_model=ObraResumenOut)
def obra_resumen(
    obra_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    obra = get_obra_or_404(db, obra_id)

    worker_rows = db.execute(
        select(
            User.id,
            User.full_name,
            func.sum(WorkEntry.hours),
            func.count(WorkEntry.id),
        )
        .join(User, User.id == WorkEntry.user_id)
        .where(WorkEntry.obra_id == obra.id)
        .group_by(User.id, User.full_name)
        .order_by(User.full_name)
    ).all()
    workers = [
        WorkerHoursRow(
            user_id=u_id,
            user_full_name=u_name,
            total_hours=Decimal(str(hours)),
            entry_count=count,
        )
        for u_id, u_name, hours, count in worker_rows
    ]

    first_date, last_date = db.execute(
        select(func.min(WorkEntry.work_date), func.max(WorkEntry.work_date)).where(
            WorkEntry.obra_id == obra.id
        )
    ).one()
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

    return ObraResumenOut(
        obra_id=obra.id,
        obra_name=obra.name,
        workers=workers,
        total_hours=sum((w.total_hours for w in workers), Decimal("0")),
        photo_count=photo_count,
        video_count=video_count,
        first_entry_date=first_date,
        last_entry_date=last_date,
    )
