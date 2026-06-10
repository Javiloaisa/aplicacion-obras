from datetime import datetime, timedelta, timezone

DATE = "2026-06-09"


def utc_naive_days_ago(days: int) -> datetime:
    return (datetime.now(timezone.utc) - timedelta(days=days)).replace(tzinfo=None)


def create_entry(client, obra_id, headers, **overrides):
    payload = {"work_date": DATE, "hours": 8, "notes": "alicatado baño"}
    payload.update(overrides)
    return client.post(
        f"/api/v1/obras/{obra_id}/entries", json=payload, headers=headers
    )


def test_worker_creates_entry_with_manual_hours(client, worker_headers, obra):
    res = create_entry(client, obra.id, worker_headers)
    assert res.status_code == 201
    data = res.json()
    assert float(data["hours"]) == 8.0
    assert data["notes"] == "alicatado baño"
    assert data["edited_by_admin"] is False


def test_hours_computed_from_start_end(client, worker_headers, obra):
    res = create_entry(
        client, obra.id, worker_headers,
        hours=None, start_time="08:00", end_time="16:30",
    )
    assert res.status_code == 201
    assert float(res.json()["hours"]) == 8.5


def test_end_before_start_rejected(client, worker_headers, obra):
    res = create_entry(
        client, obra.id, worker_headers,
        hours=None, start_time="16:00", end_time="08:00",
    )
    assert res.status_code == 422


def test_missing_hours_and_times_rejected(client, worker_headers, obra):
    res = create_entry(client, obra.id, worker_headers, hours=None)
    assert res.status_code == 422


def test_hours_out_of_range_rejected(client, worker_headers, obra):
    assert create_entry(client, obra.id, worker_headers, hours=17).status_code == 422
    assert create_entry(client, obra.id, worker_headers, hours=0.1).status_code == 422


def test_daily_cap_24h(client, worker_headers, obra):
    for _ in range(3):
        assert create_entry(client, obra.id, worker_headers, hours=8).status_code == 201
    res = create_entry(client, obra.id, worker_headers, hours=1)
    assert res.status_code == 400


def test_worker_cannot_create_entry_in_unassigned_obra(
    client, worker_headers, other_obra
):
    res = create_entry(client, other_obra.id, worker_headers)
    assert res.status_code == 403


def test_worker_cannot_create_entry_for_another_user(
    client, worker_headers, obra, worker2
):
    res = create_entry(client, obra.id, worker_headers, user_id=str(worker2.id))
    assert res.status_code == 403


def test_admin_creates_entry_for_worker(client, admin_headers, obra, worker):
    res = create_entry(client, obra.id, admin_headers, user_id=str(worker.id))
    assert res.status_code == 201
    assert res.json()["user_id"] == str(worker.id)


def test_worker_lists_only_own_entries(
    client, worker_headers, worker2_headers, admin_headers, obra, worker2
):
    create_entry(client, obra.id, worker_headers)
    client.post(
        f"/api/v1/obras/{obra.id}/assignments",
        json={"add": [str(worker2.id)]},
        headers=admin_headers,
    )
    create_entry(client, obra.id, worker2_headers, hours=4)

    res = client.get(f"/api/v1/obras/{obra.id}/entries", headers=worker_headers)
    data = res.json()
    assert data["count"] == 1
    assert float(data["total_hours"]) == 8.0

    res = client.get(f"/api/v1/obras/{obra.id}/entries", headers=admin_headers)
    assert res.json()["count"] == 2


def test_admin_filters_entries_by_user_and_date(
    client, admin_headers, worker_headers, obra, worker
):
    create_entry(client, obra.id, worker_headers, work_date="2026-06-01")
    create_entry(client, obra.id, worker_headers, work_date="2026-06-08")

    res = client.get(
        f"/api/v1/obras/{obra.id}/entries?from=2026-06-05&user_id={worker.id}",
        headers=admin_headers,
    )
    data = res.json()
    assert data["count"] == 1
    assert data["items"][0]["work_date"] == "2026-06-08"
    assert data["items"][0]["user_full_name"] == "Trabajador Uno"


def test_entries_mine_with_totals(client, worker_headers, obra):
    create_entry(client, obra.id, worker_headers, work_date="2026-06-08", hours=8)
    create_entry(client, obra.id, worker_headers, work_date="2026-06-09", hours=6)

    res = client.get("/api/v1/entries/mine", headers=worker_headers)
    data = res.json()
    assert data["count"] == 2
    assert float(data["total_hours"]) == 14.0
    assert data["items"][0]["obra_name"] == obra.name

    res = client.get("/api/v1/entries/mine?from=2026-06-09", headers=worker_headers)
    assert res.json()["count"] == 1


def test_worker_edits_own_entry_within_48h(client, worker_headers, obra):
    entry = create_entry(client, obra.id, worker_headers).json()
    res = client.patch(
        f"/api/v1/entries/{entry['id']}", json={"hours": 6}, headers=worker_headers
    )
    assert res.status_code == 200
    assert float(res.json()["hours"]) == 6.0
    assert res.json()["edited_by_admin"] is False


def test_worker_cannot_edit_others_entry(
    client, worker_headers, worker2_headers, admin_headers, obra, worker2
):
    entry = create_entry(client, obra.id, worker_headers).json()
    res = client.patch(
        f"/api/v1/entries/{entry['id']}", json={"hours": 1}, headers=worker2_headers
    )
    assert res.status_code == 403


def test_worker_cannot_edit_entry_after_48h(
    client, worker_headers, obra, db_session
):
    from app.models import WorkEntry

    entry_id = create_entry(client, obra.id, worker_headers).json()["id"]
    entry = db_session.get(WorkEntry, __import__("uuid").UUID(entry_id))
    entry.created_at = utc_naive_days_ago(3)
    db_session.add(entry)
    db_session.commit()

    res = client.patch(
        f"/api/v1/entries/{entry_id}", json={"hours": 6}, headers=worker_headers
    )
    assert res.status_code == 403
    res = client.delete(f"/api/v1/entries/{entry_id}", headers=worker_headers)
    assert res.status_code == 403


def test_admin_edit_marks_edited_by_admin(client, worker_headers, admin_headers, obra):
    entry = create_entry(client, obra.id, worker_headers).json()
    res = client.patch(
        f"/api/v1/entries/{entry['id']}", json={"hours": 7.5}, headers=admin_headers
    )
    assert res.status_code == 200
    assert res.json()["edited_by_admin"] is True


def test_edit_recomputes_hours_from_times(client, worker_headers, obra):
    entry = create_entry(client, obra.id, worker_headers).json()
    res = client.patch(
        f"/api/v1/entries/{entry['id']}",
        json={"start_time": "07:00", "end_time": "15:00"},
        headers=worker_headers,
    )
    assert res.status_code == 200
    assert float(res.json()["hours"]) == 8.0


def test_edit_respects_daily_cap(client, worker_headers, obra):
    create_entry(client, obra.id, worker_headers, hours=16)
    entry = create_entry(client, obra.id, worker_headers, hours=4).json()
    res = client.patch(
        f"/api/v1/entries/{entry['id']}", json={"hours": 10}, headers=worker_headers
    )
    assert res.status_code == 400


def test_worker_deletes_own_entry(client, worker_headers, obra):
    entry = create_entry(client, obra.id, worker_headers).json()
    res = client.delete(f"/api/v1/entries/{entry['id']}", headers=worker_headers)
    assert res.status_code == 204
    assert client.get("/api/v1/entries/mine", headers=worker_headers).json()["count"] == 0


def test_admin_deletes_any_entry(client, worker_headers, admin_headers, obra):
    entry = create_entry(client, obra.id, worker_headers).json()
    res = client.delete(f"/api/v1/entries/{entry['id']}", headers=admin_headers)
    assert res.status_code == 204
