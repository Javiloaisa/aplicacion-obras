"""Content of the hours PDF: the day-by-day detail grouped per worker.

Asserts on the flowables handed to reportlab rather than on rendered bytes,
so the report's content can be checked without a PDF parser.
"""
import uuid
from datetime import date
from decimal import Decimal

from reportlab.platypus import LongTable, Paragraph

from app.schemas.informes import HorasEntryRow, HorasReportOut
from app.services.report_pdf import _append_day_detail

OBRA_A, OBRA_B = uuid.uuid4(), uuid.uuid4()
ANA, LUIS = uuid.uuid4(), uuid.uuid4()


def entry(user_id, name, work_date, hours, *, notes=None, obra_id=OBRA_A,
          obra="Obra Centro", trade="Fontanero", validated=True, edited=False):
    return HorasEntryRow(
        id=uuid.uuid4(), obra_id=obra_id, obra_name=obra, user_id=user_id,
        user_full_name=name, trade=trade, work_date=work_date,
        hours=Decimal(hours), notes=notes, validated=validated,
        edited_by_admin=edited, media_count=0,
    )


def report(entries) -> HorasReportOut:
    return HorasReportOut(
        rows=[], entries=entries, by_trade=[],
        total_hours=sum((e.hours for e in entries), Decimal("0")),
        total_entries=len(entries),
    )


def tables(story) -> list[list[list]]:
    return [t._cellvalues for t in story if isinstance(t, LongTable)]


def text(cell) -> str:
    return cell.getPlainText() if isinstance(cell, Paragraph) else str(cell)


def build(entries, *, show_obra=True) -> list:
    story = []
    _append_day_detail(story, report(entries), width=515, show_obra=show_obra)
    return story


def test_one_row_per_day_with_notes():
    story = build([
        entry(ANA, "Ana", date(2026, 8, 3), "8", notes="Cambio de bajante"),
        entry(ANA, "Ana", date(2026, 8, 4), "7.5"),
    ])
    rows = tables(story)[0]

    assert rows[0] == ["Fecha", "Obra", "Horas", "Validado", "Notas"]
    assert [r[0] for r in rows[1:3]] == ["03/08/2026", "04/08/2026"]
    assert text(rows[1][4]) == "Cambio de bajante"
    assert text(rows[2][4]) == "—"


def test_rows_are_grouped_per_worker_with_a_subtotal():
    story = build([
        entry(LUIS, "Luis", date(2026, 8, 5), "6"),
        entry(ANA, "Ana", date(2026, 8, 3), "8"),
        entry(ANA, "Ana", date(2026, 8, 4), "7.5"),
    ])
    ana, luis = tables(story)

    # One table per worker, alphabetical, each closed by its own total
    assert ana[-1][0] == "Total Ana · 2 partes"
    assert ana[-1][2] == "15h 30m"
    assert luis[-1][0] == "Total Luis · 1 parte"
    assert luis[-1][2] == "6h 00m"


def test_days_are_listed_chronologically():
    story = build([
        entry(ANA, "Ana", date(2026, 8, 9), "4"),
        entry(ANA, "Ana", date(2026, 8, 2), "4"),
        entry(ANA, "Ana", date(2026, 8, 5), "4"),
    ])
    rows = tables(story)[0]
    assert [r[0] for r in rows[1:4]] == ["02/08/2026", "05/08/2026", "09/08/2026"]


def test_obra_column_dropped_when_filtering_by_obra():
    story = build([entry(ANA, "Ana", date(2026, 8, 3), "8")], show_obra=False)
    rows = tables(story)[0]
    assert rows[0] == ["Fecha", "Horas", "Validado", "Notas"]
    assert rows[1][1] == "8h 00m"


def test_pending_and_admin_edited_entries_are_flagged():
    story = build([
        entry(ANA, "Ana", date(2026, 8, 3), "8", validated=False, edited=True),
    ])
    rows = tables(story)[0]
    assert rows[1][2] == "8h 00m *"
    assert rows[1][3] == "Pendiente"
    assert any(
        isinstance(f, Paragraph) and "editadas por el administrador" in f.getPlainText()
        for f in story
    )


def test_notes_with_markup_characters_are_escaped():
    story = build([
        entry(ANA, "Ana", date(2026, 8, 3), "8", notes="Fugas <graves> & urgentes"),
    ])
    note = tables(story)[0][1][4]
    assert isinstance(note, Paragraph)
    assert note.getPlainText() == "Fugas <graves> & urgentes"


def test_empty_report_adds_nothing():
    assert build([]) == []
