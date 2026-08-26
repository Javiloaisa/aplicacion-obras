from datetime import date, timedelta

DATE = "2026-07-19"
OTHER_DATE = "2026-07-18"


def block(client, headers, user_ids, blocked_date=DATE, **overrides):
    payload = {"blocked_date": blocked_date, "user_ids": user_ids}
    payload.update(overrides)
    return client.post("/api/v1/bloqueos", json=payload, headers=headers)


def create_entry(client, obra_id, headers, **overrides):
    payload = {"work_date": DATE, "hours": 8}
    payload.update(overrides)
    return client.post(
        f"/api/v1/obras/{obra_id}/entries", json=payload, headers=headers
    )


def test_worker_cannot_manage_bloqueos(client, worker_headers, worker):
    assert block(client, worker_headers, [str(worker.id)]).status_code == 403
    assert client.get("/api/v1/bloqueos", headers=worker_headers).status_code == 403


def test_admin_blocks_several_workers_at_once(
    client, admin_headers, worker, worker2
):
    res = block(
        client, admin_headers, [str(worker.id), str(worker2.id)], note="no vinieron"
    )
    assert res.status_code == 201
    data = res.json()
    assert len(data) == 2
    assert {row["user_id"] for row in data} == {str(worker.id), str(worker2.id)}
    assert all(row["note"] == "no vinieron" for row in data)

    listed = client.get("/api/v1/bloqueos", headers=admin_headers).json()
    assert len(listed) == 2
    assert listed[0]["user_full_name"] is not None


def test_blocking_twice_skips_existing(client, admin_headers, worker):
    assert block(client, admin_headers, [str(worker.id)]).status_code == 201
    res = block(client, admin_headers, [str(worker.id)])
    assert res.status_code == 201
    assert res.json() == []
    assert len(client.get("/api/v1/bloqueos", headers=admin_headers).json()) == 1


def test_admin_blocks_several_dates_at_once(client, admin_headers, worker, worker2):
    dates = ["2026-08-02", "2026-08-09", "2026-08-16"]
    res = client.post(
        "/api/v1/bloqueos",
        json={
            "blocked_dates": dates,
            "user_ids": [str(worker.id), str(worker2.id)],
            "note": "domingos",
        },
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert len(data) == 6
    assert {row["blocked_date"] for row in data} == set(dates)

    listed = client.get("/api/v1/bloqueos", headers=admin_headers).json()
    assert len(listed) == 6


def test_multiple_dates_skip_only_existing_pairs(client, admin_headers, worker):
    assert block(client, admin_headers, [str(worker.id)], blocked_date=DATE).status_code == 201
    res = client.post(
        "/api/v1/bloqueos",
        json={"blocked_dates": [DATE, OTHER_DATE], "user_ids": [str(worker.id)]},
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert [row["blocked_date"] for row in data] == [OTHER_DATE]
    assert len(client.get("/api/v1/bloqueos", headers=admin_headers).json()) == 2


def test_block_without_any_date_rejected(client, admin_headers, worker):
    res = client.post(
        "/api/v1/bloqueos",
        json={"user_ids": [str(worker.id)]},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_too_many_dates_rejected(client, admin_headers, worker):
    start = date(2026, 1, 1)
    dates = [(start + timedelta(days=i)).isoformat() for i in range(400)]
    res = client.post(
        "/api/v1/bloqueos",
        json={"blocked_dates": dates, "user_ids": [str(worker.id)]},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_worker_cannot_create_entry_on_bulk_blocked_day(
    client, admin_headers, worker_headers, worker, obra
):
    client.post(
        "/api/v1/bloqueos",
        json={"blocked_dates": [OTHER_DATE, DATE], "user_ids": [str(worker.id)]},
        headers=admin_headers,
    )
    assert create_entry(client, obra.id, worker_headers).status_code == 403


def test_block_unknown_user_rejected(client, admin_headers):
    res = block(
        client, admin_headers, ["00000000-0000-0000-0000-000000000000"]
    )
    assert res.status_code == 404


def test_admin_deletes_a_whole_date(client, admin_headers, worker, worker2):
    block(client, admin_headers, [str(worker.id), str(worker2.id)], blocked_date=DATE)
    block(client, admin_headers, [str(worker.id)], blocked_date=OTHER_DATE)

    res = client.delete(f"/api/v1/bloqueos?date={DATE}", headers=admin_headers)
    assert res.status_code == 204

    listed = client.get("/api/v1/bloqueos", headers=admin_headers).json()
    assert [row["blocked_date"] for row in listed] == [OTHER_DATE]


def test_delete_whole_date_requires_admin(client, worker_headers):
    res = client.delete(f"/api/v1/bloqueos?date={DATE}", headers=worker_headers)
    assert res.status_code == 403


def test_delete_whole_date_lets_workers_post_again(
    client, admin_headers, worker_headers, worker, obra
):
    block(client, admin_headers, [str(worker.id)])
    assert create_entry(client, obra.id, worker_headers).status_code == 403

    assert (
        client.delete(f"/api/v1/bloqueos?date={DATE}", headers=admin_headers).status_code
        == 204
    )
    assert create_entry(client, obra.id, worker_headers).status_code == 201


def test_worker_cannot_create_entry_on_blocked_day(
    client, admin_headers, worker_headers, worker, obra
):
    block(client, admin_headers, [str(worker.id)])
    res = create_entry(client, obra.id, worker_headers)
    assert res.status_code == 403
    assert "bloqueado" in res.json()["detail"]


def test_block_only_affects_that_worker_and_date(
    client, admin_headers, worker_headers, worker2_headers, worker, obra
):
    block(client, admin_headers, [str(worker.id)])
    # Another worker, same date: allowed
    assert create_entry(client, obra.id, worker2_headers).status_code == 201
    # Same worker, another date: allowed
    assert (
        create_entry(client, obra.id, worker_headers, work_date=OTHER_DATE).status_code
        == 201
    )


def test_admin_can_create_entry_on_blocked_day(
    client, admin_headers, worker, obra
):
    block(client, admin_headers, [str(worker.id)])
    res = create_entry(client, obra.id, admin_headers, user_id=str(worker.id))
    assert res.status_code == 201


def test_worker_cannot_move_entry_to_blocked_day(
    client, admin_headers, worker_headers, worker, obra
):
    entry = create_entry(client, obra.id, worker_headers, work_date=OTHER_DATE).json()
    block(client, admin_headers, [str(worker.id)])
    res = client.patch(
        f"/api/v1/entries/{entry['id']}",
        json={"work_date": DATE},
        headers=worker_headers,
    )
    assert res.status_code == 403


def test_unblocking_allows_entries_again(
    client, admin_headers, worker_headers, worker, obra
):
    created = block(client, admin_headers, [str(worker.id)]).json()
    assert create_entry(client, obra.id, worker_headers).status_code == 403

    res = client.delete(
        f"/api/v1/bloqueos/{created[0]['id']}", headers=admin_headers
    )
    assert res.status_code == 204
    assert create_entry(client, obra.id, worker_headers).status_code == 201
