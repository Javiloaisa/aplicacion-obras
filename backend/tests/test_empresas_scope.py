"""Fase 2: company-scoped access across obras, partes, media, usuarios and bloqueos.

This is not the exhaustive matrix (that's Fase 6) — it proves the scope_empresa
mechanism actually works end to end for each resource type it was wired into.
"""
import uuid

from tests.test_media import make_jpeg


def _assign_obra(db_session, obra, *empresas):
    obra.empresas = list(empresas)
    db_session.add(obra)
    db_session.commit()


# --- obras -------------------------------------------------------------


def test_worker_sees_own_empresa_shared_and_unassigned_obras(
    client, db_session, worker_nido_headers, obra, other_obra, empresa_nido, empresa_fega
):
    _assign_obra(db_session, obra, empresa_nido, empresa_fega)  # shared
    _assign_obra(db_session, other_obra, empresa_fega)  # Fega-only

    res = client.get("/api/v1/obras", headers=worker_nido_headers)
    names = {o["name"] for o in res.json()}
    assert obra.name in names  # shared obra: visible
    assert other_obra.name not in names  # other empresa's exclusive obra


def test_worker_sin_empresa_sees_every_obra(
    client, db_session, worker_headers, obra, other_obra, empresa_nido, empresa_fega
):
    _assign_obra(db_session, obra, empresa_nido)
    _assign_obra(db_session, other_obra, empresa_fega)

    res = client.get("/api/v1/obras", headers=worker_headers)
    names = {o["name"] for o in res.json()}
    assert {obra.name, other_obra.name} <= names


def test_admin_single_empresa_404_on_other_empresa_obra(
    client, db_session, admin_nido_headers, other_obra, empresa_fega
):
    _assign_obra(db_session, other_obra, empresa_fega)
    res = client.get(f"/api/v1/obras/{other_obra.id}", headers=admin_nido_headers)
    assert res.status_code == 404


def test_admin_todas_empresas_filters_by_query_param(
    client, db_session, admin_headers, obra, other_obra, empresa_nido, empresa_fega
):
    _assign_obra(db_session, obra, empresa_nido)
    _assign_obra(db_session, other_obra, empresa_fega)

    only_nido = client.get("/api/v1/obras?empresa=nido", headers=admin_headers).json()
    names = {o["name"] for o in only_nido}
    assert obra.name in names
    assert other_obra.name not in names

    todas = client.get("/api/v1/obras", headers=admin_headers).json()
    names = {o["name"] for o in todas}
    assert {obra.name, other_obra.name} <= names


def test_admin_cannot_edit_other_empresa_obra(
    client, db_session, admin_nido_headers, other_obra, empresa_fega
):
    _assign_obra(db_session, other_obra, empresa_fega)
    res = client.patch(
        f"/api/v1/obras/{other_obra.id}", json={"name": "Renombrada"}, headers=admin_nido_headers
    )
    assert res.status_code == 404


# --- partes --------------------------------------------------------------


def test_worker_cannot_create_entry_in_obra_of_other_empresa(
    client, db_session, worker_nido_headers, other_obra, empresa_fega
):
    _assign_obra(db_session, other_obra, empresa_fega)
    res = client.post(
        f"/api/v1/obras/{other_obra.id}/entries",
        json={"work_date": "2026-06-09", "hours": 8},
        headers=worker_nido_headers,
    )
    assert res.status_code == 404


def test_worker_sin_empresa_can_file_in_any_obra(
    client, db_session, worker_headers, other_obra, empresa_fega
):
    _assign_obra(db_session, other_obra, empresa_fega)
    res = client.post(
        f"/api/v1/obras/{other_obra.id}/entries",
        json={"work_date": "2026-06-09", "hours": 8},
        headers=worker_headers,
    )
    assert res.status_code == 201
    assert res.json()["obra_id"] == str(other_obra.id)


def test_entry_empresa_id_ignores_body_and_uses_worker_empresa(
    client, db_session, worker_nido_headers, obra, empresa_nido, empresa_fega
):
    from app.models import WorkEntry

    res = client.post(
        f"/api/v1/obras/{obra.id}/entries",
        json={"work_date": "2026-06-09", "hours": 8, "empresa_id": str(empresa_fega.id)},
        headers=worker_nido_headers,
    )
    assert res.status_code == 201
    # WorkEntryCreate has no empresa_id field: the extra key is silently dropped
    # and the parte is always stamped with the *worker's* empresa server-side.
    entry = db_session.get(WorkEntry, uuid.UUID(res.json()["id"]))
    assert entry.empresa_id == empresa_nido.id


def test_admin_single_empresa_sees_only_own_partes_in_shared_obra(
    client, db_session, admin_nido_headers, obra, worker_nido, worker_fega_headers,
    empresa_nido, empresa_fega,
):
    _assign_obra(db_session, obra, empresa_nido, empresa_fega)
    client.post(
        f"/api/v1/obras/{obra.id}/entries",
        json={"work_date": "2026-06-09", "hours": 4, "user_id": str(worker_nido.id)},
        headers=admin_nido_headers,
    )
    client.post(
        f"/api/v1/obras/{obra.id}/entries",
        json={"work_date": "2026-06-09", "hours": 5},
        headers=worker_fega_headers,
    )

    res = client.get(f"/api/v1/obras/{obra.id}/entries", headers=admin_nido_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["user_id"] == str(worker_nido.id)


def test_admin_single_empresa_404_on_other_empresa_entry(
    client, db_session, admin_nido_headers, admin_fega_headers, obra, worker_fega, empresa_nido, empresa_fega
):
    _assign_obra(db_session, obra, empresa_nido, empresa_fega)
    created = client.post(
        f"/api/v1/obras/{obra.id}/entries",
        json={"work_date": "2026-06-09", "hours": 4, "user_id": str(worker_fega.id)},
        headers=admin_fega_headers,
    ).json()

    res = client.patch(
        f"/api/v1/entries/{created['id']}", json={"notes": "x"}, headers=admin_nido_headers
    )
    assert res.status_code == 404
    res = client.delete(f"/api/v1/entries/{created['id']}", headers=admin_nido_headers)
    assert res.status_code == 404


def test_admin_single_empresa_cannot_validate_other_empresa_entry(
    client, db_session, admin_nido_headers, admin_fega_headers, obra, worker_fega, empresa_nido, empresa_fega
):
    _assign_obra(db_session, obra, empresa_nido, empresa_fega)
    created = client.post(
        f"/api/v1/obras/{obra.id}/entries",
        json={"work_date": "2026-06-09", "hours": 4, "user_id": str(worker_fega.id)},
        headers=admin_fega_headers,
    ).json()

    res = client.patch(
        f"/api/v1/entries/{created['id']}/validate",
        json={"validated": True},
        headers=admin_nido_headers,
    )
    assert res.status_code == 404


# --- media -----------------------------------------------------------------


def test_media_scoped_by_empresa_in_shared_obra(
    client, db_session, admin_nido_headers, worker_fega_headers, obra, empresa_nido, empresa_fega
):
    _assign_obra(db_session, obra, empresa_nido, empresa_fega)
    files = [("files", ("foto.jpg", make_jpeg(), "application/octet-stream"))]
    client.post(
        f"/api/v1/obras/{obra.id}/media", files=files, headers=worker_fega_headers
    )

    res = client.get(f"/api/v1/obras/{obra.id}/media", headers=admin_nido_headers)
    assert res.status_code == 200
    assert res.json()["total"] == 0


def test_admin_ambas_must_pick_empresa_to_upload(client, obra, admin_headers):
    files = [("files", ("foto.jpg", make_jpeg(), "application/octet-stream"))]
    res = client.post(f"/api/v1/obras/{obra.id}/media", files=files, headers=admin_headers)
    assert res.status_code == 400


# --- usuarios ----------------------------------------------------------


def test_single_empresa_admin_cannot_see_omni_admin_in_list(
    client, admin_nido_headers, admin, admin_nido
):
    # `admin` (acceso_todas_empresas=True) has empresa_id NULL, same storage
    # shape as a pending worker — but it must never leak the same way.
    res = client.get("/api/v1/usuarios", headers=admin_nido_headers)
    assert res.status_code == 200
    usernames = {u["username"] for u in res.json()}
    assert admin.username not in usernames
    assert admin_nido.username in usernames


def test_single_empresa_admin_404_on_omni_admin_detail_actions(
    client, admin_nido_headers, admin
):
    res = client.patch(
        f"/api/v1/usuarios/{admin.id}", json={"is_active": False}, headers=admin_nido_headers
    )
    assert res.status_code == 404
    res = client.delete(f"/api/v1/usuarios/{admin.id}", headers=admin_nido_headers)
    assert res.status_code == 404
    res = client.get(f"/api/v1/usuarios/{admin.id}/password", headers=admin_nido_headers)
    assert res.status_code == 404


def test_omni_admin_sees_and_can_manage_another_omni_admin(client, db_session, admin_headers):
    from app.models import User
    from app.security import hash_password

    other_omni = User(
        username="otro-admin-todas",
        full_name="Otro Admin Todas",
        password_hash=hash_password("x"),
        role="admin",
        must_change_password=False,
        acceso_todas_empresas=True,
    )
    db_session.add(other_omni)
    db_session.commit()

    res = client.get("/api/v1/usuarios", headers=admin_headers)
    assert res.status_code == 200
    assert other_omni.username in {u["username"] for u in res.json()}

    res = client.patch(
        f"/api/v1/usuarios/{other_omni.id}", json={"trade": "Fontanero"}, headers=admin_headers
    )
    assert res.status_code == 200


def test_admin_creates_worker_in_any_empresa_regardless_of_own_scope(
    client, admin_nido_headers, empresa_fega
):
    res = client.post(
        "/api/v1/usuarios",
        json={
            "username": "trabajador.fega",
            "full_name": "Trabajador Fega",
            "empresa": "fega",
        },
        headers=admin_nido_headers,
    )
    assert res.status_code == 201
    assert res.json()["empresa_id"] == str(empresa_fega.id)


def test_admin_single_empresa_cannot_edit_other_empresa_user(
    client, admin_nido_headers, worker_fega
):
    res = client.patch(
        f"/api/v1/usuarios/{worker_fega.id}",
        json={"is_active": False},
        headers=admin_nido_headers,
    )
    assert res.status_code == 404


def test_admin_single_empresa_cannot_delete_other_empresa_user(
    client, admin_nido_headers, worker_fega
):
    res = client.delete(f"/api/v1/usuarios/{worker_fega.id}", headers=admin_nido_headers)
    assert res.status_code == 404


def test_worker_cannot_have_acceso_todas_empresas_via_update(client, admin_headers, worker_fega):
    # role stays worker, so acceso_todas_empresas can never be granted via this endpoint
    res = client.patch(
        f"/api/v1/usuarios/{worker_fega.id}",
        json={"full_name": "Sigue siendo worker"},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["acceso_todas_empresas"] is False


# --- bloqueos ------------------------------------------------------------


def test_admin_cannot_block_day_for_other_empresa_worker(
    client, admin_nido_headers, worker_fega
):
    res = client.post(
        "/api/v1/bloqueos",
        json={"user_ids": [str(worker_fega.id)], "blocked_date": "2026-06-09"},
        headers=admin_nido_headers,
    )
    assert res.status_code == 404


def test_bloqueos_list_scoped_by_empresa(
    client, admin_headers, admin_nido_headers, worker_nido, worker_fega
):
    client.post(
        "/api/v1/bloqueos",
        json={"user_ids": [str(worker_nido.id), str(worker_fega.id)], "blocked_date": "2026-06-09"},
        headers=admin_headers,
    )
    res = client.get("/api/v1/bloqueos", headers=admin_nido_headers)
    names = {b["user_full_name"] for b in res.json()}
    assert worker_nido.full_name in names
    assert worker_fega.full_name not in names
