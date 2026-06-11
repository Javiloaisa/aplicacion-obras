def test_worker_cannot_create_obra(client, worker_headers):
    res = client.post(
        "/api/v1/obras", json={"name": "Obra nueva"}, headers=worker_headers
    )
    assert res.status_code == 403


def test_admin_creates_obra(client, admin_headers):
    res = client.post(
        "/api/v1/obras",
        json={"name": "Obra nueva", "client_name": "Cliente X"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Obra nueva"
    assert data["status"] == "active"


def test_worker_sees_all_active_obras(client, worker_headers, obra, other_obra):
    res = client.get("/api/v1/obras", headers=worker_headers)
    assert res.status_code == 200
    names = [o["name"] for o in res.json()]
    assert obra.name in names
    assert other_obra.name in names


def test_admin_sees_all_obras_and_filters_by_status(
    client, admin_headers, obra, other_obra, db_session
):
    res = client.get("/api/v1/obras", headers=admin_headers)
    assert len(res.json()) == 2

    client.patch(
        f"/api/v1/obras/{other_obra.id}",
        json={"status": "archived"},
        headers=admin_headers,
    )
    res = client.get("/api/v1/obras?status=archived", headers=admin_headers)
    names = [o["name"] for o in res.json()]
    assert names == [other_obra.name]


def test_worker_sees_any_active_obra_detail(client, worker_headers, other_obra):
    res = client.get(f"/api/v1/obras/{other_obra.id}", headers=worker_headers)
    assert res.status_code == 200
    assert res.json()["name"] == other_obra.name


def test_obra_detail_includes_summary(client, worker_headers, obra):
    client.post(
        f"/api/v1/obras/{obra.id}/entries",
        json={"work_date": "2026-06-09", "hours": 8},
        headers=worker_headers,
    )
    res = client.get(f"/api/v1/obras/{obra.id}", headers=worker_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["photo_count"] == 0
    assert data["video_count"] == 0
    assert float(data["total_hours"]) == 8.0


def test_archive_obra_sets_archived_at_and_hides_from_worker(
    client, admin_headers, worker_headers, obra
):
    res = client.patch(
        f"/api/v1/obras/{obra.id}",
        json={"status": "archived"},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["archived_at"] is not None

    assert client.get("/api/v1/obras", headers=worker_headers).json() == []
    res = client.get(f"/api/v1/obras/{obra.id}", headers=worker_headers)
    assert res.status_code == 403


def test_worker_cannot_edit_obra(client, worker_headers, obra):
    res = client.patch(
        f"/api/v1/obras/{obra.id}", json={"name": "Hackeada"}, headers=worker_headers
    )
    assert res.status_code == 403
