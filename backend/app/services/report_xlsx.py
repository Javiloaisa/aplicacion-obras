"""Editable spreadsheet of the hours report (FENIC Integral).

Same content as the PDF, but meant to be opened in Excel or Google Sheets and
edited there: hours are real duration values and every total is a formula over
the "Detalle" sheet, so fixing a parte in the detail updates the summary.
"""
import io
from collections.abc import Callable, Sequence

from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from app.schemas.informes import HorasReportOut
from app.services.format import hours_to_minutes

INK = "32373C"
BRAND = "F9B414"
GREY = "6B7280"

HOURS = "[h]:mm"  # durations past 24h keep counting instead of wrapping
DATE = "dd/mm/yyyy"
NO_TRADE = "Sin oficio"

_title = Font(bold=True, size=14, color=INK)
_h2 = Font(bold=True, size=11, color=INK)
_muted = Font(color=GREY)
_bold = Font(bold=True, color=INK)
_head_font = Font(bold=True, color="FFFFFF")
_head_fill = PatternFill("solid", fgColor=INK)
_total_fill = PatternFill("solid", fgColor=BRAND)
_wrap = Alignment(wrap_text=True, vertical="top")

SUMMARY = "Resumen"
DETAIL = "Detalle"
DETAIL_HEAD = ["Fecha", "Obra", "Trabajador", "Oficio", "Horas", "Validado", "Editado por admin", "Notas"]
DETAIL_WIDTHS = [12, 30, 24, 16, 9, 11, 10, 60]
SUMMARY_WIDTHS = [34, 26, 16, 10, 10]


class _Formula(str):
    """Marks the strings we write as formulas; any other text starting with '=' stays literal."""


def _f(expr: str) -> _Formula:
    return _Formula("=" + expr)


def _col(name: str) -> str:
    """Whole-column reference into the detail sheet, so rows added there later count too."""
    letter = get_column_letter(DETAIL_HEAD.index(name) + 1)
    return f"{DETAIL}!${letter}:${letter}"


def _duration(hours) -> float:
    """Spreadsheets store durations as fractions of a day; round to the minute like the PDF."""
    return hours_to_minutes(hours) / (24 * 60)


def _put(ws: Worksheet, row: int, values: Sequence, formats: dict[int, str], *, font=None, fill=None):
    for col, value in enumerate(values, 1):
        if isinstance(value, str) and not isinstance(value, _Formula):
            # Free text typed by users: drop control chars openpyxl rejects
            value = ILLEGAL_CHARACTERS_RE.sub("", value)
        cell = ws.cell(row, col, value)
        if cell.data_type == "f" and not isinstance(value, _Formula):
            cell.data_type = "s"  # e.g. a note "=HYPERLINK(...)" must not run
        if col in formats:
            cell.number_format = formats[col]
        if font is not None:
            cell.font = font
        if fill is not None:
            cell.fill = fill


def _widths(ws: Worksheet, widths: list[int]) -> None:
    for col, width in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = width


def _table(
    ws: Worksheet,
    top: int,
    title: str,
    head: list[str],
    items: Sequence,
    make_row: Callable[[object, int], list],
    formats: dict[int, str],
    total: Callable[[int, int], list] | None = None,
) -> int:
    """Titled table starting at row `top`; returns the next free row.

    `make_row(item, row)` gets its row number so formulas can point at their own
    cells; `total(first, last)` builds the closing row over the data rows.
    """
    ws.cell(top, 1, title).font = _h2
    _put(ws, top + 1, head, {}, font=_head_font, fill=_head_fill)
    row = top + 1
    for item in items:
        row += 1
        _put(ws, row, make_row(item, row), formats)
    if not items:
        row += 1
        ws.cell(row, 1, "Sin datos para estos filtros").font = _muted
    if total is not None:
        row += 1
        _put(ws, row, total(top + 2, row - 1), formats, font=_bold, fill=_total_fill)
    return row + 2


def _write_summary(
    ws: Worksheet,
    data: HorasReportOut,
    *,
    period: str,
    obra_label: str | None,
    worker_label: str | None,
    generated: str,
) -> None:
    filt = [f"Periodo: {period}"]
    if obra_label:
        filt.append(f"Obra: {obra_label}")
    if worker_label:
        filt.append(f"Trabajador: {worker_label}")
    _put(ws, 1, ["Informe de horas · FENIC Integral"], {}, font=_title)
    _put(ws, 2, ["  ·  ".join(filt)], {}, font=_muted)
    _put(ws, 3, [f"Generado el {generated}"], {}, font=_muted)

    hours, dates, trades = _col("Horas"), _col("Fecha"), _col("Oficio")
    obras, workers = _col("Obra"), _col("Trabajador")

    _put(ws, 5, ["Horas totales", _f(f"SUM({hours})")], {2: HOURS}, font=_bold)
    _put(ws, 6, ["Partes", _f(f"COUNT({dates})")], {}, font=_bold)
    row = 8

    if data.by_trade:
        row = _table(
            ws, row, "Por oficio", ["Oficio", "Horas"],
            [t.trade or NO_TRADE for t in data.by_trade],
            lambda trade, r: [trade, _f(f"SUMIFS({hours},{trades},A{r})")],
            {2: HOURS},
        )

    row = _table(
        ws, row, "Resumen por obra y trabajador",
        ["Obra", "Trabajador", "Oficio", "Partes", "Horas"],
        data.rows,
        lambda item, r: [
            item.obra_name, item.user_full_name, item.trade or NO_TRADE,
            _f(f"COUNTIFS({obras},A{r},{workers},B{r})"),
            _f(f"SUMIFS({hours},{obras},A{r},{workers},B{r})"),
        ],
        {5: HOURS},
        total=lambda a, b: ["TOTAL", "", "", _f(f"SUM(D{a}:D{b})"), _f(f"SUM(E{a}:E{b})")],
    )

    # Stands in for the PDF's per-worker subtotals, which would break sorting in a sheet
    by_worker = sorted({r.user_full_name: r.trade for r in data.rows}.items(), key=lambda kv: kv[0].lower())
    _table(
        ws, row, "Por trabajador", ["Trabajador", "Oficio", "Partes", "Horas"],
        by_worker,
        lambda item, r: [
            item[0], item[1] or NO_TRADE,
            _f(f"COUNTIFS({workers},A{r})"),
            _f(f"SUMIFS({hours},{workers},A{r})"),
        ],
        {4: HOURS},
        total=lambda a, b: ["TOTAL", "", _f(f"SUM(C{a}:C{b})"), _f(f"SUM(D{a}:D{b})")],
    )
    _widths(ws, SUMMARY_WIDTHS)


def _write_detail(ws: Worksheet, data: HorasReportOut) -> None:
    """One row per parte, grouped by worker and in date order like the PDF."""
    _put(ws, 1, DETAIL_HEAD, {}, font=_head_font, fill=_head_fill)
    entries = sorted(data.entries, key=lambda e: (e.user_full_name.lower(), e.work_date, e.obra_name))
    for row, e in enumerate(entries, 2):
        _put(ws, row, [
            e.work_date, e.obra_name, e.user_full_name, e.trade or NO_TRADE,
            _duration(e.hours),
            "Sí" if e.validated else "Pendiente",
            "Sí" if e.edited_by_admin else "",
            e.notes or "",
        ], {1: DATE, 5: HOURS})
        ws.cell(row, len(DETAIL_HEAD)).alignment = _wrap
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(DETAIL_HEAD))}{len(entries) + 1}"
    _widths(ws, DETAIL_WIDTHS)


def build_horas_xlsx(
    data: HorasReportOut,
    *,
    period: str,
    obra_label: str | None,
    worker_label: str | None,
    generated: str,
) -> bytes:
    wb = Workbook()
    summary = wb.active
    summary.title = SUMMARY
    _write_summary(
        summary, data,
        period=period, obra_label=obra_label, worker_label=worker_label, generated=generated,
    )
    _write_detail(wb.create_sheet(DETAIL), data)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
