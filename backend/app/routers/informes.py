import csv
import io
import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import get_db, get_obra_or_404, require_admin
from app.models import MediaFile, Obra, User, WorkEntry
from app.schemas.informes import (
    HorasEntryRow,
    HorasReportOut,
    HorasRow,
    ObraResumenOut,
    TradeHoursRow,
    WorkerHoursRow,
)

router = APIRouter(prefix="/informes", tags=["informes"])


def _group_by_trade(rows) -> list[TradeHoursRow]:
    """Aggregate per-worker rows (which carry .trade/.total_hours) by trade."""
    hours: dict[str | None, Decimal] = {}
    for r in rows:
        hours[r.trade] = hours.get(r.trade, Decimal("0")) + r.total_hours
    # Stable order: named trades alphabetically, "sin oficio" (None) last
    keys = sorted(hours.keys(), key=lambda t: (t is None, (t or "").lower()))
    return [TradeHoursRow(trade=t, total_hours=hours[t]) for t in keys]


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


_MEDIA_COUNT_SUBQ = (
    select(func.count(MediaFile.id))
    .where(MediaFile.work_entry_id == WorkEntry.id)
    .correlate(WorkEntry)
    .scalar_subquery()
)


def _entries_detail(db, obra_id, user_id, from_date, to_date) -> list[HorasEntryRow]:
    stmt = (
        select(WorkEntry, Obra.name, User.full_name, User.trade, _MEDIA_COUNT_SUBQ)
        .join(Obra, Obra.id == WorkEntry.obra_id)
        .join(User, User.id == WorkEntry.user_id)
        .order_by(WorkEntry.work_date.desc(), Obra.name, User.full_name)
    )
    stmt = _entries_filter(stmt, obra_id, user_id, from_date, to_date)
    return [
        HorasEntryRow(
            id=entry.id,
            obra_id=entry.obra_id,
            obra_name=obra_name,
            user_id=entry.user_id,
            user_full_name=full_name,
            trade=trade,
            work_date=entry.work_date,
            hours=entry.hours,
            notes=entry.notes,
            validated=entry.validated,
            edited_by_admin=entry.edited_by_admin,
            media_count=media_count,
        )
        for entry, obra_name, full_name, trade, media_count in db.execute(stmt).all()
    ]


def _horas_report_data(db, obra_id, user_id, from_date, to_date) -> HorasReportOut:
    stmt = (
        select(
            Obra.id,
            Obra.name,
            User.id,
            User.full_name,
            User.trade,
            func.sum(WorkEntry.hours),
            func.count(WorkEntry.id),
        )
        .join(Obra, Obra.id == WorkEntry.obra_id)
        .join(User, User.id == WorkEntry.user_id)
        .group_by(Obra.id, Obra.name, User.id, User.full_name, User.trade)
        .order_by(Obra.name, User.full_name)
    )
    stmt = _entries_filter(stmt, obra_id, user_id, from_date, to_date)

    rows = []
    for o_id, o_name, u_id, u_name, trade, hours, count in db.execute(stmt).all():
        rows.append(
            HorasRow(
                obra_id=o_id,
                obra_name=o_name,
                user_id=u_id,
                user_full_name=u_name,
                trade=trade,
                total_hours=Decimal(str(hours)),
                entry_count=count,
            )
        )
    return HorasReportOut(
        rows=rows,
        entries=_entries_detail(db, obra_id, user_id, from_date, to_date),
        by_trade=_group_by_trade(rows),
        total_hours=sum((r.total_hours for r in rows), Decimal("0")),
        total_entries=sum(r.entry_count for r in rows),
    )


def _period_label(from_date: date | None, to_date: date | None) -> str:
    fmt = "%d/%m/%Y"
    if from_date and to_date:
        return f"{from_date.strftime(fmt)} – {to_date.strftime(fmt)}"
    if from_date:
        return f"desde {from_date.strftime(fmt)}"
    if to_date:
        return f"hasta {to_date.strftime(fmt)}"
    return "todo el histórico"


@router.get("/horas", response_model=HorasReportOut)
def horas_report(
    obra_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return _horas_report_data(db, obra_id, user_id, from_date, to_date)


@router.get("/horas/export.pdf")
def horas_export_pdf(
    obra_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from zoneinfo import ZoneInfo

    from app.services.report_pdf import build_horas_pdf

    data = _horas_report_data(db, obra_id, user_id, from_date, to_date)
    obra = db.get(Obra, obra_id) if obra_id else None
    worker = db.get(User, user_id) if user_id else None
    generated = datetime.now(ZoneInfo("Europe/Madrid")).strftime("%d/%m/%Y %H:%M")

    pdf = build_horas_pdf(
        data,
        period=_period_label(from_date, to_date),
        obra_label=obra.name if obra else None,
        worker_label=worker.full_name if worker else None,
        generated=generated,
    )
    filename = "informe_horas"
    if from_date is not None:
        filename += f"_{from_date.isoformat()}"
    if to_date is not None:
        filename += f"_{to_date.isoformat()}"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
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
        select(WorkEntry, Obra.name, User.full_name, User.trade)
        .join(Obra, Obra.id == WorkEntry.obra_id)
        .join(User, User.id == WorkEntry.user_id)
        .order_by(Obra.name, User.full_name, WorkEntry.work_date)
    )
    stmt = _entries_filter(stmt, obra_id, user_id, from_date, to_date)

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(
        ["obra", "trabajador", "oficio", "fecha", "inicio", "fin", "horas", "validado", "notas"]
    )
    for entry, obra_name, full_name, trade in db.execute(stmt).all():
        writer.writerow(
            [
                obra_name,
                full_name,
                trade or "",
                entry.work_date.isoformat(),
                entry.start_time.strftime("%H:%M") if entry.start_time else "",
                entry.end_time.strftime("%H:%M") if entry.end_time else "",
                str(entry.hours),
                "Sí" if entry.validated else "No",
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
            User.trade,
            func.sum(WorkEntry.hours),
            func.count(WorkEntry.id),
        )
        .join(User, User.id == WorkEntry.user_id)
        .where(WorkEntry.obra_id == obra.id)
        .group_by(User.id, User.full_name, User.trade)
        .order_by(User.full_name)
    ).all()
    workers = []
    for u_id, u_name, trade, hours, count in worker_rows:
        workers.append(
            WorkerHoursRow(
                user_id=u_id,
                user_full_name=u_name,
                trade=trade,
                total_hours=Decimal(str(hours)),
                entry_count=count,
            )
        )

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
        by_trade=_group_by_trade(workers),
        total_hours=sum((w.total_hours for w in workers), Decimal("0")),
        photo_count=photo_count,
        video_count=video_count,
        first_entry_date=first_date,
        last_entry_date=last_date,
    )
