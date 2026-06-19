def test_list_requires_admin(client, worker_headers):
    res = client.get("/api/v1/usuarios", headers=worker_headers)
    assert res.status_code == 403


def test_admin_lists_users(client, admin_headers, worker):
    res = client.get("/api/v1/usuarios", headers=admin_headers)
    assert res.status_code == 200
    usernames = [u["username"] for u in res.json()]
    assert "worker1" in usernames
    assert "jefe" in usernames


def test_create_user_returns_temp_password_once(client, admin_headers):
    res = client.post(
        "/api/v1/usuarios",
        json={"username": "Nuevo.Trabajador", "full_name": "Nuevo Trabajador"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["username"] == "nuevo.trabajador"  # stored lowercase
    assert data["role"] == "worker"
    assert data["must_change_password"] is True
    assert len(data["temp_password"]) >= 8

    # Temp password works for login and forces a change
    login = client.post(
        "/api/v1/auth/login",
        json={
            "username": "nuevo.trabajador",
            "password": data["temp_password"],
            "client": "worker_app",
        },
    )
    assert login.status_code == 200
    assert login.json()["user"]["must_change_password"] is True

    # The listing never exposes passwords
    listed = client.get("/api/v1/usuarios", headers=admin_headers).json()
    assert all("temp_password" not in u for u in listed)


def test_duplicate_username_rejected(client, admin_headers, worker):
    res = client.post(
        "/api/v1/usuarios",
        json={"username": "worker1", "full_name": "Duplicado"},
        headers=admin_headers,
    )
    assert res.status_code == 409


def test_invalid_username_rejected(client, admin_headers):
    res = client.post(
        "/api/v1/usuarios",
        json={"username": "no espacios", "full_name": "X"},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_create_requires_admin(client, worker_headers):
    res = client.post(
        "/api/v1/usuarios",
        json={"username": "intruso", "full_name": "Intruso"},
        headers=worker_headers,
    )
    assert res.status_code == 403


def test_deactivate_user(client, admin_headers, worker, worker_headers):
    res = client.patch(
        f"/api/v1/usuarios/{worker.id}",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False
    assert res.json()["temp_password"] is None

    # Deactivated user's token stops working
    res = client.get("/api/v1/entries/mine", headers=worker_headers)
    assert res.status_code == 401


def test_reset_password(client, admin_headers, worker):
    res = client.patch(
        f"/api/v1/usuarios/{worker.id}",
        json={"reset_password": True},
        headers=admin_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["must_change_password"] is True

    login = client.post(
        "/api/v1/auth/login",
        json={
            "username": "worker1",
            "password": data["temp_password"],
            "client": "worker_app",
        },
    )
    assert login.status_code == 200


def test_admin_cannot_deactivate_self(client, admin_headers, admin):
    res = client.patch(
        f"/api/v1/usuarios/{admin.id}",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert res.status_code == 400

    res = client.patch(
        f"/api/v1/usuarios/{admin.id}",
        json={"role": "worker"},
        headers=admin_headers,
    )
    assert res.status_code == 400


def test_patch_unknown_user_404(client, admin_headers):
    res = client.patch(
        "/api/v1/usuarios/00000000-0000-0000-0000-000000000000",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert res.status_code == 404


def test_admin_sets_custom_password(client, admin_headers, worker):
    res = client.patch(
        f"/api/v1/usuarios/{worker.id}",
        json={"new_password": "supersecreta123"},
        headers=admin_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["temp_password"] is None
    assert data["must_change_password"] is False

    login = client.post(
        "/api/v1/auth/login",
        json={
            "username": "worker1",
            "password": "supersecreta123",
            "client": "worker_app",
        },
    )
    assert login.status_code == 200


def test_admin_reveals_password_after_set(client, admin_headers, worker):
    client.patch(
        f"/api/v1/usuarios/{worker.id}",
        json={"new_password": "supersecreta123"},
        headers=admin_headers,
    )
    res = client.get(f"/api/v1/usuarios/{worker.id}/password", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["password"] == "supersecreta123"


def test_revealed_password_matches_reset_temp(client, admin_headers, worker):
    reset = client.patch(
        f"/api/v1/usuarios/{worker.id}",
        json={"reset_password": True},
        headers=admin_headers,
    ).json()
    res = client.get(f"/api/v1/usuarios/{worker.id}/password", headers=admin_headers)
    assert res.json()["password"] == reset["temp_password"]


def test_reveal_password_none_for_legacy_account(client, admin_headers, worker):
    # The fixture sets only the hash (no encrypted copy), like pre-feature accounts
    res = client.get(f"/api/v1/usuarios/{worker.id}/password", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["password"] is None


def test_reveal_password_requires_admin(client, worker_headers, worker):
    res = client.get(f"/api/v1/usuarios/{worker.id}/password", headers=worker_headers)
    assert res.status_code == 403


def test_new_password_too_short_rejected(client, admin_headers, worker):
    res = client.patch(
        f"/api/v1/usuarios/{worker.id}",
        json={"new_password": "short"},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_delete_user_without_history(client, admin_headers):
    created = client.post(
        "/api/v1/usuarios",
        json={"username": "borrame", "full_name": "Borrame"},
        headers=admin_headers,
    ).json()

    res = client.delete(f"/api/v1/usuarios/{created['id']}", headers=admin_headers)
    assert res.status_code == 204

    listed = client.get("/api/v1/usuarios", headers=admin_headers).json()
    assert all(u["username"] != "borrame" for u in listed)


def test_delete_user_with_entries_cascades(client, admin_headers, worker_headers, obra):
    client.post(
        f"/api/v1/obras/{obra.id}/entries",
        json={"work_date": "2026-06-09", "hours": 8},
        headers=worker_headers,
    )
    worker_id = client.get("/api/v1/usuarios", headers=admin_headers).json()
    worker_id = next(u["id"] for u in worker_id if u["username"] == "worker1")

    # The worker can now be deleted even with hours logged; entries go with them
    res = client.delete(f"/api/v1/usuarios/{worker_id}", headers=admin_headers)
    assert res.status_code == 204

    listed = client.get("/api/v1/usuarios", headers=admin_headers).json()
    assert all(u["username"] != "worker1" for u in listed)
    report = client.get("/api/v1/informes/horas", headers=admin_headers).json()
    assert report["total_entries"] == 0


def test_delete_self_blocked(client, admin_headers, admin):
    res = client.delete(f"/api/v1/usuarios/{admin.id}", headers=admin_headers)
    assert res.status_code == 400


def test_delete_requires_admin(client, worker_headers, worker):
    res = client.delete(f"/api/v1/usuarios/{worker.id}", headers=worker_headers)
    assert res.status_code == 403
