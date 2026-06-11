def create_entry(client, obra_id, headers, **overrides):
    payload = {"work_date": "2026-06-09", "hours": 8}
    payload.update(overrides)
    return client.post(
        f"/api/v1/obras/{obra_id}/entries", json=payload, headers=headers
    )


def seed_entries(client, admin_headers, obra, other_obra, worker, worker2):
    create_entry(client, obra.id, admin_headers, user_id=str(worker.id), hours=8)
    create_entry(
        client, obra.id, admin_headers,
        user_id=str(worker.id), hours=4, work_date="2026-06-10",
    )
    create_entry(client, obra.id, admin_headers, user_id=str(worker2.id), hours=6)
    create_entry(client, other_obra.id, admin_headers, user_id=str(worker.id), hours=5)


def test_horas_report_requires_admin(client, worker_headers):
    res = client.get("/api/v1/informes/horas", headers=worker_headers)
    assert res.status_code == 403


def test_horas_report_groups_by_obra_and_worker(
    client, admin_headers, obra, other_obra, worker, worker2
):
    seed_entries(client, admin_headers, obra, other_obra, worker, worker2)

    res = client.get("/api/v1/informes/horas", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_entries"] == 4
    assert float(data["total_hours"]) == 23.0
    assert len(data["rows"]) == 3

    by_key = {(r["obra_id"], r["user_id"]): r for r in data["rows"]}
    row = by_key[(str(obra.id), str(worker.id))]
    assert float(row["total_hours"]) == 12.0
    assert row["entry_count"] == 2


def test_horas_report_filters(
    client, admin_headers, obra, other_obra, worker, worker2
):
    seed_entries(client, admin_headers, obra, other_obra, worker, worker2)

    res = client.get(
        f"/api/v1/informes/horas?obra_id={obra.id}&user_id={worker.id}"
        "&from=2026-06-10&to=2026-06-10",
        headers=admin_headers,
    )
    data = res.json()
    assert data["total_entries"] == 1
    assert float(data["total_hours"]) == 4.0


def test_csv_export(client, admin_headers, obra, other_obra, worker, worker2):
    seed_entries(client, admin_headers, obra, other_obra, worker, worker2)

    res = client.get(
        f"/api/v1/informes/horas/export.csv?obra_id={obra.id}", headers=admin_headers
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment" in res.headers["content-disposition"]

    lines = res.text.lstrip("﻿").strip().splitlines()
    assert lines[0] == "obra;trabajador;oficio;fecha;inicio;fin;horas;notas"
    assert len(lines) == 4  # header + 3 entries in this obra
    assert "Trabajador Uno" in res.text
    assert "Nave Industrial" not in res.text


def test_csv_export_requires_admin(client, worker_headers):
    res = client.get("/api/v1/informes/horas/export.csv", headers=worker_headers)
    assert res.status_code == 403


def test_pdf_export(client, admin_headers, obra, other_obra, worker, worker2):
    seed_entries(client, admin_headers, obra, other_obra, worker, worker2)
    res = client.get(
        f"/api/v1/informes/horas/export.pdf?obra_id={obra.id}", headers=admin_headers
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "attachment" in res.headers["content-disposition"]
    assert res.content[:4] == b"%PDF"


def test_pdf_export_requires_admin(client, worker_headers):
    res = client.get("/api/v1/informes/horas/export.pdf", headers=worker_headers)
    assert res.status_code == 403


def test_obra_resumen(client, admin_headers, obra, other_obra, worker, worker2):
    seed_entries(client, admin_headers, obra, other_obra, worker, worker2)

    res = client.get(
        f"/api/v1/informes/obra/{obra.id}/resumen", headers=admin_headers
    )
    assert res.status_code == 200
    data = res.json()
    assert data["obra_name"] == obra.name
    assert float(data["total_hours"]) == 18.0
    assert len(data["workers"]) == 2
    assert data["first_entry_date"] == "2026-06-09"
    assert data["last_entry_date"] == "2026-06-10"
    assert data["photo_count"] == 0
    assert data["video_count"] == 0


def test_horas_report_includes_trade(
    client, admin_headers, db_session, obra, other_obra, worker, worker2
):
    worker.trade = "Fontanero"
    worker2.trade = "Albañil"
    db_session.commit()

    seed_entries(client, admin_headers, obra, other_obra, worker, worker2)

    data = client.get("/api/v1/informes/horas", headers=admin_headers).json()
    by_key = {(r["obra_id"], r["user_id"]): r for r in data["rows"]}
    assert by_key[(str(obra.id), str(worker.id))]["trade"] == "Fontanero"
    assert by_key[(str(obra.id), str(worker2.id))]["trade"] == "Albañil"

    # worker: 12 h in this obra + 5 h in the other one
    by_trade = {t["trade"]: t for t in data["by_trade"]}
    assert float(by_trade["Fontanero"]["total_hours"]) == 17.0
    assert float(by_trade["Albañil"]["total_hours"]) == 6.0


def test_obra_resumen_empty_obra(client, admin_headers, other_obra):
    res = client.get(
        f"/api/v1/informes/obra/{other_obra.id}/resumen", headers=admin_headers
    )
    assert res.status_code == 200
    data = res.json()
    assert data["workers"] == []
    assert float(data["total_hours"]) == 0.0
    assert data["first_entry_date"] is None
