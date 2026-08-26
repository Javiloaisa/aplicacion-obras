"""Branded PDF of the hours report (FENIC Integral).

Pure-python via reportlab so it needs no system libraries in the container.
"""
import io
from decimal import Decimal
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    LongTable,
    PageTemplate,
    Paragraph,
    Table,
    TableStyle,
)
from reportlab.lib.styles import ParagraphStyle

from app.schemas.informes import HorasReportOut
from app.services.format import hours_hm

INK = colors.HexColor("#32373c")
BRAND = colors.HexColor("#f9b414")
LIGHT = colors.HexColor("#f3f4f6")
GREY = colors.HexColor("#6b7280")
LINE = colors.HexColor("#e5e7eb")

_LOGO = Path(__file__).resolve().parent.parent / "assets" / "logo.png"
_BAND_H = 64

_title = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=16, textColor=INK, spaceAfter=2)
_sub = ParagraphStyle("sub", fontName="Helvetica", fontSize=10, textColor=GREY, spaceAfter=10)
_h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11, textColor=INK, spaceBefore=10, spaceAfter=4)
_h3 = ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=10, textColor=INK, spaceBefore=12, spaceAfter=3)
# Notes can be long, so detail cells wrap instead of overflowing the column.
_cell = ParagraphStyle("cell", fontName="Helvetica", fontSize=8, textColor=INK, leading=10)


def _hours(value) -> str:
    return hours_hm(value)


def _esc(text: str) -> str:
    """Notes are free text typed by workers; keep reportlab's mini-HTML out."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _draw_chrome(canvas, doc):
    w, h = A4
    canvas.saveState()
    # light header band with a brand rule underneath
    canvas.setFillColor(colors.white)
    canvas.rect(0, h - _BAND_H, w, _BAND_H, fill=1, stroke=0)
    canvas.setStrokeColor(BRAND)
    canvas.setLineWidth(2)
    canvas.line(0, h - _BAND_H, w, h - _BAND_H)
    try:
        img = ImageReader(str(_LOGO))
        iw, ih = img.getSize()
        target_h = 44
        target_w = target_h * iw / ih
        canvas.drawImage(
            img, 40, h - _BAND_H + (_BAND_H - target_h) / 2,
            width=target_w, height=target_h, mask="auto",
        )
    except Exception:
        canvas.setFillColor(INK)
        canvas.setFont("Helvetica-Bold", 16)
        canvas.drawString(40, h - 40, "FENIC Integral")
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawRightString(w - 40, h - 38, "Informe de horas")
    # footer
    canvas.setStrokeColor(LINE)
    canvas.line(40, 36, w - 40, 36)
    canvas.setFillColor(GREY)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(40, 24, f"FENIC Integral · generado el {doc._generated}")
    canvas.drawRightString(w - 40, 24, f"Página {doc.page}")
    canvas.restoreState()


def build_horas_pdf(
    data: HorasReportOut,
    *,
    period: str,
    obra_label: str | None,
    worker_label: str | None,
    generated: str,
) -> bytes:
    buf = io.BytesIO()
    w, h = A4
    doc = BaseDocTemplate(
        buf, pagesize=A4,
        leftMargin=40, rightMargin=40, topMargin=_BAND_H + 16, bottomMargin=44,
    )
    doc._generated = generated
    frame = Frame(40, 44, w - 80, h - _BAND_H - 16 - 44, id="body")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=_draw_chrome)])

    story = []

    filt = [f"Periodo: {period}"]
    if obra_label:
        filt.append(f"Obra: {obra_label}")
    if worker_label:
        filt.append(f"Trabajador: {worker_label}")
    story.append(Paragraph("Resumen de horas trabajadas", _title))
    story.append(Paragraph("  ·  ".join(filt), _sub))

    # KPI strip
    kpis = [["Horas totales", "Partes"],
            [_hours(data.total_hours), str(data.total_entries)]]
    kt = Table(kpis, colWidths=[(w - 80) / 2] * 2)
    kt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), GREY),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, 1), 16),
        ("TEXTCOLOR", (0, 1), (-1, 1), INK),
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("LINEAFTER", (0, 0), (-2, -1), 1, colors.white),
    ]))
    story.append(kt)

    # By trade
    if data.by_trade:
        story.append(Paragraph("Por oficio", _h2))
        rows = [["Oficio", "Horas"]]
        for t in data.by_trade:
            rows.append([t.trade or "Sin oficio", _hours(t.total_hours)])
        tt = Table(rows, colWidths=[(w - 80) - 100, 100])
        tt.setStyle(_table_style())
        story.append(tt)

    # Totals per obra and worker
    story.append(Paragraph("Resumen por obra y trabajador", _h2))
    head = ["Obra", "Trabajador", "Oficio", "Partes", "Horas"]
    rows = [head]
    for r in data.rows:
        rows.append([
            r.obra_name, r.user_full_name, r.trade or "—",
            str(r.entry_count), _hours(r.total_hours),
        ])
    if len(rows) == 1:
        rows.append(["Sin datos para estos filtros", "", "", "", ""])
    total_row = ["TOTAL", "", "", str(data.total_entries), _hours(data.total_hours)]
    rows.append(total_row)

    dt = LongTable(rows, colWidths=[165, 140, 95, 50, 65], repeatRows=1)
    dt.setStyle(_table_style(total=True))
    story.append(dt)

    _append_day_detail(story, data, width=w - 80, show_obra=obra_label is None)

    doc.build(story)
    return buf.getvalue()


def _append_day_detail(story, data: HorasReportOut, *, width: float, show_obra: bool) -> None:
    """Day-by-day rows grouped by worker, with the notes each parte carries."""
    if not data.entries:
        return

    story.append(Paragraph("Detalle por día", _h2))

    by_worker: dict[str, list] = {}
    trades: dict[str, str | None] = {}
    for e in data.entries:
        by_worker.setdefault(e.user_full_name, []).append(e)
        trades.setdefault(e.user_full_name, e.trade)

    for name in sorted(by_worker, key=str.lower):
        entries = sorted(by_worker[name], key=lambda e: e.work_date)
        trade = trades.get(name)
        story.append(Paragraph(f"{name}{f' · {trade}' if trade else ''}", _h3))

        head = ["Fecha", "Obra", "Horas", "Validado", "Notas"] if show_obra else [
            "Fecha", "Horas", "Validado", "Notas"
        ]
        rows = [head]
        for e in entries:
            note = Paragraph(_esc(e.notes), _cell) if e.notes else "—"
            validated = "Sí" if e.validated else "Pendiente"
            hours = _hours(e.hours) + (" *" if e.edited_by_admin else "")
            rows.append(
                [e.work_date.strftime("%d/%m/%Y"), e.obra_name, hours, validated, note]
                if show_obra
                else [e.work_date.strftime("%d/%m/%Y"), hours, validated, note]
            )

        subtotal = sum((e.hours for e in entries), Decimal("0"))
        count = len(entries)
        label = f"Total {name} · {count} {'parte' if count == 1 else 'partes'}"
        rows.append(
            [label, "", _hours(subtotal), "", ""] if show_obra else [label, _hours(subtotal), "", ""]
        )

        widths = (
            [62, 120, 52, 55, width - 289]
            if show_obra
            else [70, 60, 60, width - 190]
        )
        table = LongTable(rows, colWidths=widths, repeatRows=1)
        table.setStyle(_detail_style(hours_col=2 if show_obra else 1))
        story.append(table)

    if any(e.edited_by_admin for e in data.entries):
        story.append(
            Paragraph("* Horas editadas por el administrador.", _sub)
        )


def _detail_style(*, hours_col: int) -> TableStyle:
    return TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("TEXTCOLOR", (0, 1), (-1, -1), INK),
        ("ALIGN", (hours_col, 0), (hours_col, -1), "RIGHT"),
        ("VALIGN", (0, 1), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, LIGHT]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), BRAND),
        ("TEXTCOLOR", (0, -1), (-1, -1), INK),
    ])


def _table_style(total: bool = False) -> TableStyle:
    style = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (-1, -1), INK),
        ("ALIGN", (-2, 0), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]
    if total:
        style += [
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), BRAND),
            ("TEXTCOLOR", (0, -1), (-1, -1), INK),
        ]
    return TableStyle(style)
