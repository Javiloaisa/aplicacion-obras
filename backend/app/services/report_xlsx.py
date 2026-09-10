"""Editable spreadsheet of the hours report (FENIC Integral).

Same content as the PDF, but meant to be opened in Excel or Google Sheets and
edited there: hours are real duration values and every total is a formula over
the "Detalle" sheet, so fixing a parte in the detail updates the summary.

Each formula is stored together with its result: Excel's protected view, the
Drive preview and phone viewers don't recalculate, and without a stored result
they would show the totals empty.
"""
import io
import re
from collections import defaultdict
from collections.abc import Callable, Hashable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date

import xlsxwriter
from xlsxwriter.utility import xl_col_to_name
from xlsxwriter.worksheet import Worksheet

from app.schemas.informes import HorasEntryRow, HorasReportOut
from app.services.format import hours_to_minutes

INK = "#32373C"
BRAND = "#F9B414"
GREY = "#6B7280"

HOURS = "[h]:mm"  # durations past 24h keep counting instead of wrapping
DATE = "dd/mm/yyyy"
NO_TRADE = "Sin oficio"

TITLE = {"bold": True, "font_size": 14, "font_color": INK}
H2 = {"bold": True, "font_size": 11, "font_color": INK}
MUTED = {"font_color": GREY}
BOLD = {"bold": True, "font_color": INK}
HEAD = {"bold": True, "font_color": "#FFFFFF", "bg_color": INK}
TOTAL = {"bold": True, "font_color": INK, "bg_color": BRAND}
WRAP = {"text_wrap": True, "valign": "top"}

SUMMARY = "Resumen"
DETAIL = "Detalle"
DETAIL_HEAD = ["Fecha", "Obra", "Trabajador", "Oficio", "Horas", "Validado", "Editado por admin", "Notas"]
DETAIL_WIDTHS = [12, 30, 24, 16, 9, 11, 10, 60]
SUMMARY_WIDTHS = [34, 26, 16, 10, 10]

# XML 1.0 forbids most control characters; notes are typed on phones
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


@dataclass(frozen=True)
class _Formula:
    expr: str
    value: float | int  # result stored for viewers that don't recalculate


def _col(name: str) -> str:
    """Whole-column reference into the detail sheet, so rows added there later count too."""
    letter = xl_col_to_name(DETAIL_HEAD.index(name))
    return f"{DETAIL}!${letter}:${letter}"


def _days(minutes: int) -> float:
    """Spreadsheets store durations as fractions of a day."""
    return minutes / (24 * 60)


def _aggregate(entries: Iterable[HorasEntryRow], key: Callable[[HorasEntryRow], Hashable]):
    """Parte count and minutes per key, rounded per parte like the PDF."""
    count: dict = defaultdict(int)
    minutes: dict = defaultdict(int)
    for e in entries:
        count[key(e)] += 1
        minutes[key(e)] += hours_to_minutes(e.hours)
    return count, minutes


class _Book:
    def __init__(self, buf: io.BytesIO):
        self.wb = xlsxwriter.Workbook(buf, {"in_memory": True})
        self._formats: dict = {}

    def _fmt(self, props: dict):
        if not props:
            return None
        key = tuple(sorted(props.items()))
        if key not in self._formats:
            self._formats[key] = self.wb.add_format(props)
        return self._formats[key]

    def put(
        self,
        ws: Worksheet,
        row: int,
        values: Sequence,
        cols: dict[int, dict] | None = None,
        style: dict | None = None,
    ) -> None:
        """Write `values` from column A of 1-based `row`; `cols` adds per-column props."""
        for i, value in enumerate(values):
            fmt = self._fmt({**(style or {}), **(cols or {}).get(i + 1, {})})
            if isinstance(value, _Formula):
                ws.write_formula(row - 1, i, value.expr, fmt, value.value)
            elif isinstance(value, str):
                # write_string keeps user text like "=HYPERLINK(...)" from becoming a formula
                ws.write_string(row - 1, i, _CONTROL_CHARS.sub("", value), fmt)
            elif isinstance(value, date):
                ws.write_datetime(row - 1, i, value, fmt)
            else:
                ws.write_number(row - 1, i, value, fmt)

    def table(
        self,
        ws: Worksheet,
        top: int,
        title: str,
        head: list[str],
        items: Sequence,
        make_row: Callable[[object, int], list],
        cols: dict[int, dict],
        total: Callable[[int, int], list] | None = None,
    ) -> int:
        """Titled table starting at 1-based row `top`; returns the next free row.

        `make_row(item, row)` gets its row number so formulas can point at their
        own cells; `total(first, last)` builds the closing row over the data rows.
        """
        self.put(ws, top, [title], style=H2)
        self.put(ws, top + 1, head, style=HEAD)
        row = top + 1
        for item in items:
            row += 1
            self.put(ws, row, make_row(item, row), cols)
        if not items:
            row += 1
            self.put(ws, row, ["Sin datos para estos filtros"], style=MUTED)
        if total is not None:
            row += 1
            self.put(ws, row, total(top + 2, row - 1), cols, style=TOTAL)
        return row + 2


def _widths(ws: Worksheet, widths: list[int]) -> None:
    for col, width in enumerate(widths):
        ws.set_column(col, col, width)


def _write_summary(
    book: _Book,
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
    book.put(ws, 1, ["Informe de horas · FENIC Integral"], style=TITLE)
    book.put(ws, 2, ["  ·  ".join(filt)], style=MUTED)
    book.put(ws, 3, [f"Generado el {generated}"], style=MUTED)

    hours, dates, trades = _col("Horas"), _col("Fecha"), _col("Oficio")
    obras, workers = _col("Obra"), _col("Trabajador")
    entries = data.entries
    hours_col = {"num_format": HOURS}

    total_minutes = sum(hours_to_minutes(e.hours) for e in entries)
    book.put(ws, 5, ["Horas totales", _Formula(f"=SUM({hours})", _days(total_minutes))],
             {2: hours_col}, style=BOLD)
    book.put(ws, 6, ["Partes", _Formula(f"=COUNT({dates})", len(entries))], style=BOLD)
    row = 8

    if data.by_trade:
        _, trade_min = _aggregate(entries, lambda e: e.trade or NO_TRADE)
        row = book.table(
            ws, row, "Por oficio", ["Oficio", "Horas"],
            [t.trade or NO_TRADE for t in data.by_trade],
            lambda trade, r: [
                trade, _Formula(f"=SUMIFS({hours},{trades},A{r})", _days(trade_min[trade])),
            ],
            {2: hours_col},
        )

    pair_count, pair_min = _aggregate(entries, lambda e: (e.obra_name, e.user_full_name))
    pairs = [(r.obra_name, r.user_full_name) for r in data.rows]
    row = book.table(
        ws, row, "Resumen por obra y trabajador",
        ["Obra", "Trabajador", "Oficio", "Partes", "Horas"],
        data.rows,
        lambda item, r: [
            item.obra_name, item.user_full_name, item.trade or NO_TRADE,
            _Formula(f"=COUNTIFS({obras},A{r},{workers},B{r})",
                     pair_count[(item.obra_name, item.user_full_name)]),
            _Formula(f"=SUMIFS({hours},{obras},A{r},{workers},B{r})",
                     _days(pair_min[(item.obra_name, item.user_full_name)])),
        ],
        {5: hours_col},
        total=lambda a, b: [
            "TOTAL", "", "",
            _Formula(f"=SUM(D{a}:D{b})", sum(pair_count[p] for p in pairs)),
            _Formula(f"=SUM(E{a}:E{b})", _days(sum(pair_min[p] for p in pairs))),
        ],
    )

    # Stands in for the PDF's per-worker subtotals, which would break sorting in a sheet
    worker_count, worker_min = _aggregate(entries, lambda e: e.user_full_name)
    by_worker = sorted({r.user_full_name: r.trade for r in data.rows}.items(), key=lambda kv: kv[0].lower())
    names = [name for name, _ in by_worker]
    book.table(
        ws, row, "Por trabajador", ["Trabajador", "Oficio", "Partes", "Horas"],
        by_worker,
        lambda item, r: [
            item[0], item[1] or NO_TRADE,
            _Formula(f"=COUNTIFS({workers},A{r})", worker_count[item[0]]),
            _Formula(f"=SUMIFS({hours},{workers},A{r})", _days(worker_min[item[0]])),
        ],
        {4: hours_col},
        total=lambda a, b: [
            "TOTAL", "",
            _Formula(f"=SUM(C{a}:C{b})", sum(worker_count[n] for n in names)),
            _Formula(f"=SUM(D{a}:D{b})", _days(sum(worker_min[n] for n in names))),
        ],
    )
    _widths(ws, SUMMARY_WIDTHS)


def _write_detail(book: _Book, ws: Worksheet, data: HorasReportOut) -> None:
    """One row per parte, grouped by worker and in date order like the PDF."""
    book.put(ws, 1, DETAIL_HEAD, style=HEAD)
    entries = sorted(data.entries, key=lambda e: (e.user_full_name.lower(), e.work_date, e.obra_name))
    cols = {1: {"num_format": DATE}, 5: {"num_format": HOURS}, 8: WRAP}
    for row, e in enumerate(entries, 2):
        book.put(ws, row, [
            e.work_date, e.obra_name, e.user_full_name, e.trade or NO_TRADE,
            _days(hours_to_minutes(e.hours)),
            "Sí" if e.validated else "Pendiente",
            "Sí" if e.edited_by_admin else "",
            e.notes or "",
        ], cols)
    ws.freeze_panes(1, 0)
    ws.autofilter(0, 0, len(entries), len(DETAIL_HEAD) - 1)
    _widths(ws, DETAIL_WIDTHS)


def build_horas_xlsx(
    data: HorasReportOut,
    *,
    period: str,
    obra_label: str | None,
    worker_label: str | None,
    generated: str,
) -> bytes:
    buf = io.BytesIO()
    book = _Book(buf)
    summary = book.wb.add_worksheet(SUMMARY)
    detail = book.wb.add_worksheet(DETAIL)
    _write_summary(
        book, summary, data,
        period=period, obra_label=obra_label, worker_label=worker_label, generated=generated,
    )
    _write_detail(book, detail, data)
    book.wb.close()
    return buf.getvalue()
