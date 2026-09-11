"""Fase 6: gaps left after cross-checking the original acceptance checklist
against test_empresas_model.py / test_empresas_scope.py / test_empresas_asignacion.py.
"""
from datetime import date

from app.models import WorkEntry


def _assign_obra(db_session, obra, *empresas):
    obra.empresas = list(empresas)
    db_session.add(obra)
    db_session.commit()


def test_fega_worker_does_not_see_nido_only_obra(
    client, db_session, worker_fega_headers, obra, other_obra, empresa_nido, empresa_fega
):
    """Symmetric case of test_worker_sees_own_empresa_shared_and_unassigned_obras."""
    _assign_obra(db_session, obra, empresa_nido)  # Nido-only
    _assign_obra(db_session, other_obra, empresa_nido, empresa_fega)  # shared

    res = client.get("/api/v1/obras", headers=worker_fega_headers)
    names = {o["name"] for o in res.json()}
    assert other_obra.name in names
    assert obra.name not in names


def test_create_worker_with_acceso_todas_rejected_by_api(client, admin_headers, empresa_nido):
    res = client.post(
        "/api/v1/usuarios",
        json={"username": "trabajador.todas", "full_name": "X", "role": "worker", "empresa": "todas"},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_admin_creates_new_admin_scoped_to_other_empresa(
    client, admin_nido_headers, empresa_fega
):
    """Any admin can onboard a new admin into either empresa, or both —
    not just the trabajador case already covered elsewhere."""
    res = client.post(
        "/api/v1/usuarios",
        json={
            "username": "admin.fega.nuevo",
            "full_name": "Nuevo Admin Fega",
            "role": "admin",
            "empresa": "fega",
        },
        headers=admin_nido_headers,
    )
    assert res.status_code == 201
    assert res.json()["empresa_id"] == str(empresa_fega.id)
    assert res.json()["acceso_todas_empresas"] is False


def test_admin_creates_new_admin_with_acceso_todas(client, admin_nido_headers, empresa_nido):
    res = client.post(
        "/api/v1/usuarios",
        json={
            "username": "admin.ambas.nuevo",
            "full_name": "Nuevo Admin Ambas",
            "role": "admin",
            "empresa": "todas",
        },
        headers=admin_nido_headers,
    )
    assert res.status_code == 201
    assert res.json()["empresa_id"] is None
    assert res.json()["acceso_todas_empresas"] is True
    # And that new omni admin is immediately out of admin_nido's own scope
    listed = client.get("/api/v1/usuarios", headers=admin_nido_headers).json()
    assert "admin.ambas.nuevo" not in {u["username"] for u in listed}


def test_csv_export_respects_single_empresa_scope(
    client, db_session, admin_nido_headers, obra, worker_nido, worker_fega, empresa_nido, empresa_fega
):
    _assign_obra(db_session, obra, empresa_nido, empresa_fega)
    nido_entry = WorkEntry(
        obra_id=obra.id, user_id=worker_nido.id, empresa_id=empresa_nido.id,
        work_date=date(2026, 6, 9), hours="4.00",
    )
    fega_entry = WorkEntry(
        obra_id=obra.id, user_id=worker_fega.id, empresa_id=empresa_fega.id,
        work_date=date(2026, 6, 9), hours="5.00",
    )
    db_session.add_all([nido_entry, fega_entry])
    db_session.commit()

    res = client.get("/api/v1/informes/horas/export.csv", headers=admin_nido_headers)
    assert res.status_code == 200
    text = res.text
    assert worker_nido.full_name in text
    assert worker_fega.full_name not in text
    # Single-empresa scope: no "empresa" column (only meaningful when scope is unrestricted)
    header = text.lstrip("﻿").splitlines()[0]
    assert "empresa" not in header
