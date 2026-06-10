from tests.conftest import ADMIN_PASSWORD, WORKER_PASSWORD, TestingSessionLocal


def login(client, username, password, app_client="worker_app"):
    return client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password, "client": app_client},
    )


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_login_worker_app_ok(client, worker):
    res = login(client, "worker1", WORKER_PASSWORD)
    assert res.status_code == 200
    data = res.json()
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["token_type"] == "bearer"
    assert data["user"]["username"] == "worker1"
    assert data["user"]["role"] == "worker"
    assert data["user"]["must_change_password"] is True


def test_login_is_case_insensitive_on_username(client, worker):
    res = login(client, "WORKER1", WORKER_PASSWORD)
    assert res.status_code == 200


def test_login_wrong_password(client, worker):
    res = login(client, "worker1", "wrong-password")
    assert res.status_code == 401


def test_login_unknown_user(client):
    res = login(client, "nobody", "whatever")
    assert res.status_code == 401


def test_worker_rejected_in_admin_panel(client, worker):
    res = login(client, "worker1", WORKER_PASSWORD, app_client="admin_panel")
    assert res.status_code == 403


def test_admin_can_login_in_admin_panel(client, admin):
    res = login(client, "jefe", ADMIN_PASSWORD, app_client="admin_panel")
    assert res.status_code == 200
    assert res.json()["user"]["role"] == "admin"


def test_admin_can_login_in_worker_app(client, admin):
    res = login(client, "jefe", ADMIN_PASSWORD, app_client="worker_app")
    assert res.status_code == 200


def test_inactive_user_rejected(client, worker, db_session):
    worker.is_active = False
    db_session.add(worker)
    db_session.commit()
    res = login(client, "worker1", WORKER_PASSWORD)
    assert res.status_code == 403


def test_refresh_returns_new_tokens(client, worker):
    tokens = login(client, "worker1", WORKER_PASSWORD).json()
    res = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["access_token"]
    assert data["user"]["username"] == "worker1"


def test_refresh_rejects_access_token(client, worker):
    tokens = login(client, "worker1", WORKER_PASSWORD).json()
    res = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["access_token"]}
    )
    assert res.status_code == 401


def test_refresh_rejects_garbage_token(client):
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-jwt"})
    assert res.status_code == 401


def test_change_password_requires_auth(client):
    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "x", "new_password": "new-password-1"},
    )
    assert res.status_code == 401


def test_change_password_wrong_current(client, worker):
    tokens = login(client, "worker1", WORKER_PASSWORD).json()
    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "wrong", "new_password": "new-password-1"},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert res.status_code == 400


def test_change_password_flow(client, worker):
    tokens = login(client, "worker1", WORKER_PASSWORD).json()
    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": WORKER_PASSWORD, "new_password": "new-password-1"},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert res.status_code == 200

    # Old password no longer works, new one does and clears the flag
    assert login(client, "worker1", WORKER_PASSWORD).status_code == 401
    res = login(client, "worker1", "new-password-1")
    assert res.status_code == 200
    assert res.json()["user"]["must_change_password"] is False


def test_change_password_too_short(client, worker):
    tokens = login(client, "worker1", WORKER_PASSWORD).json()
    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": WORKER_PASSWORD, "new_password": "short"},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert res.status_code == 422


def test_protected_route_rejects_invalid_token(client, worker):
    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "x", "new_password": "new-password-1"},
        headers={"Authorization": "Bearer invalid.token.here"},
    )
    assert res.status_code == 401


def test_seed_admin_creates_user_once():
    from app.services.seed import seed_admin
    from sqlalchemy import select
    from app.models import User

    with TestingSessionLocal() as db:
        seed_admin(db)
        seed_admin(db)  # idempotent
        admins = db.scalars(select(User).where(User.username == "admin")).all()
        assert len(admins) == 1
        assert admins[0].role == "admin"
        assert admins[0].must_change_password is True
