"""Fase 3: bulk assignment endpoints (usuarios, obras) and the /me/empresa self-service."""
from datetime import date

from app.models import WorkEntry


def test_asignar_empresa_usuarios_inherits_pending_records(
    client, db_session, admin_headers, worker, obra, empresa_nido
):
    pending_entry = WorkEntry(obra_id=obra.id, user_id=worker.id, work_date=date(2026, 1, 5), hours="4.00")
    db_session.add(pending_entry)
    db_session.commit()

    res = client.post(
        "/api/v1/usuarios/asignar-empresa",
        json={"user_ids": [str(worker.id)], "empresa": "nido"},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()[0]["empresa_id"] == str(empresa_nido.id)

    db_session.refresh(pending_entry)
    assert pending_entry.empresa_id == empresa_nido.id


def test_asignar_empresa_usuarios_multiple_at_once(
    client, admin_headers, worker, worker2, empresa_fega
):
    res = client.post(
        "/api/v1/usuarios/asignar-empresa",
        json={"user_ids": [str(worker.id), str(worker2.id)], "empresa": "fega"},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert {u["empresa_id"] for u in res.json()} == {str(empresa_fega.id)}


def test_asignar_empresa_usuarios_rejects_admin_target(
    client, admin_headers, admin_nido, empresa_fega
):
    res = client.post(
        "/api/v1/usuarios/asignar-empresa",
        json={"user_ids": [str(admin_nido.id)], "empresa": "fega"},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_asignar_empresa_usuarios_404_outside_scope(
    client, admin_nido_headers, worker_fega, empresa_nido
):
    res = client.post(
        "/api/v1/usuarios/asignar-empresa",
        json={"user_ids": [str(worker_fega.id)], "empresa": "nido"},
        headers=admin_nido_headers,
    )
    assert res.status_code == 404


def test_asignar_empresa_usuarios_requires_admin(client, worker_headers, worker2, empresa_nido):
    res = client.post(
        "/api/v1/usuarios/asignar-empresa",
        json={"user_ids": [str(worker2.id)], "empresa": "nido"},
        headers=worker_headers,
    )
    assert res.status_code == 403


# --- obras ---------------------------------------------------------------


def test_set_obra_empresas_assigns_and_clears(
    client, admin_headers, obra, empresa_nido, empresa_fega
):
    res = client.put(
        f"/api/v1/obras/{obra.id}/empresas",
        json={"empresas": ["nido", "fega"]},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert set(res.json()["empresas"]) == {"nido", "fega"}

    res = client.put(
        f"/api/v1/obras/{obra.id}/empresas", json={"empresas": []}, headers=admin_headers
    )
    assert res.status_code == 200
    assert res.json()["empresas"] == []


def test_set_obra_empresas_404_outside_scope(
    client, db_session, admin_nido_headers, other_obra, empresa_fega
):
    other_obra.empresas = [empresa_fega]
    db_session.add(other_obra)
    db_session.commit()

    res = client.put(
        f"/api/v1/obras/{other_obra.id}/empresas",
        json={"empresas": ["fega"]},
        headers=admin_nido_headers,
    )
    assert res.status_code == 404


def test_asignar_empresas_obras_bulk(
    client, admin_headers, obra, other_obra, empresa_nido
):
    res = client.post(
        "/api/v1/obras/asignar-empresas",
        json={"obra_ids": [str(obra.id), str(other_obra.id)], "empresas": ["nido"]},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert all(o["empresas"] == ["nido"] for o in res.json())


def test_asignar_empresas_obras_unknown_id_404(client, admin_headers, obra):
    res = client.post(
        "/api/v1/obras/asignar-empresas",
        json={"obra_ids": [str(obra.id), "00000000-0000-0000-0000-000000000000"], "empresas": ["nido"]},
        headers=admin_headers,
    )
    assert res.status_code == 404


# --- empresas / pendientes -------------------------------------------------


def test_list_empresas(client, admin_headers, empresa_nido, empresa_fega):
    res = client.get("/api/v1/empresas", headers=admin_headers)
    assert res.status_code == 200
    slugs = {e["slug"] for e in res.json()}
    assert slugs == {"nido", "fega"}


def test_pendientes_counts(
    client, db_session, admin_headers, worker, worker2, obra, other_obra, empresa_nido
):
    res = client.get("/api/v1/empresas/pendientes", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["trabajadores"] == 2  # worker, worker2
    assert data["obras"] == 2  # obra, other_obra

    obra.empresas = [empresa_nido]
    db_session.add(obra)
    db_session.commit()

    res = client.get("/api/v1/empresas/pendientes", headers=admin_headers)
    assert res.json()["obras"] == 1


# --- /me/empresa -----------------------------------------------------------


def test_admin_ambas_drops_to_one_empresa(
    client, admin_headers, admin_fega, empresa_nido, empresa_fega
):
    # admin_fega already covers Fega, so dropping to Nido leaves no one uncovered
    res = client.post("/api/v1/me/empresa", json={"empresa": "nido"}, headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["empresa_id"] == str(empresa_nido.id)
    assert data["acceso_todas_empresas"] is False


def test_last_admin_cannot_drop_the_other_empresa(client, admin_headers, empresa_nido, empresa_fega):
    # `admin` fixture is the only admin with access to fega
    res = client.post("/api/v1/me/empresa", json={"empresa": "nido"}, headers=admin_headers)
    assert res.status_code == 400
    assert "fega" in res.json()["detail"].lower() or "Fega" in res.json()["detail"]


def test_drop_allowed_when_another_admin_covers_the_other_empresa(
    client, admin_headers, admin_fega_headers, empresa_nido, empresa_fega
):
    # admin_fega already covers Fega, so the omni admin can safely drop to Nido
    res = client.post("/api/v1/me/empresa", json={"empresa": "nido"}, headers=admin_headers)
    assert res.status_code == 200


def test_single_empresa_admin_cannot_use_me_empresa(client, admin_nido_headers):
    res = client.post("/api/v1/me/empresa", json={"empresa": "fega"}, headers=admin_nido_headers)
    assert res.status_code == 400


def test_worker_cannot_use_me_empresa(client, worker_headers):
    res = client.post("/api/v1/me/empresa", json={"empresa": "nido"}, headers=worker_headers)
    assert res.status_code == 400


def test_me_empresa_inherits_own_pending_records(
    client, db_session, admin_headers, admin, admin_fega_headers, obra, empresa_nido
):
    # The omni admin has a pending parte of their own (e.g. filed while fichando)
    pending = WorkEntry(obra_id=obra.id, user_id=admin.id, work_date=date(2026, 1, 5), hours="2.00")
    db_session.add(pending)
    db_session.commit()

    res = client.post("/api/v1/me/empresa", json={"empresa": "nido"}, headers=admin_headers)
    assert res.status_code == 200

    db_session.refresh(pending)
    assert pending.empresa_id == empresa_nido.id
