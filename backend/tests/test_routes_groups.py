import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
from main import app
from database import upsert_sync_state, upsert_dialogs_batch, hide_dialog, get_sync_state


# ---------------------------------------------------------------------------
# List groups
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_groups(mock_tg, mock_db, mock_bg_tasks):
    mock_tg.get_dialogs.return_value = [
        {"id": 1, "name": "Group1", "type": "group", "unread_count": 0},
        {"id": 2, "name": "Channel1", "type": "channel", "unread_count": 5},
    ]
    mock_db.return_value = None  # no sync state

    with patch(
        "routes.groups.get_sync_state", new_callable=AsyncMock, return_value=None
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/groups")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["name"] == "Group1"


@pytest.mark.asyncio
async def test_list_groups_with_sync_state(mock_tg, real_db_app, mock_bg_tasks, client):
    """Groups list merges sync state (active/last_synced) into dialog entries."""
    db = real_db_app
    # Seed a dialog so get_all_dialogs returns it
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "Group1", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
    ])
    await upsert_sync_state(db, chat_id=1, chat_name="Group1", active=True, last_msg_id=50)
    # Force tg to NOT be stale so we don't trigger background refresh
    mock_tg.is_cache_stale = False

    resp = await client.get("/groups")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["active"] is True
    assert data[0]["last_synced"] is not None


@pytest.mark.asyncio
async def test_list_groups_without_sync_state(mock_tg, real_db_app, mock_bg_tasks, client):
    """Dialog without a sync_state row should have active=False, last_synced=None."""
    db = real_db_app
    await upsert_dialogs_batch(db, [
        {"id": 99, "name": "NoSync", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
    ])
    mock_tg.is_cache_stale = False

    resp = await client.get("/groups")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["active"] is False
    assert data[0]["last_synced"] is None


# ---------------------------------------------------------------------------
# Toggle active
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_toggle_group_active(mock_tg, mock_db, mock_bg_tasks):
    with patch("routes.groups.upsert_sync_state", new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.patch(
                "/groups/1/active", json={"active": True, "chat_name": "Test"}
            )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_groups(mock_tg, mock_db, mock_bg_tasks, client):
    mock_tg.refresh_dialogs = AsyncMock()
    resp = await client.post("/groups/refresh")
    assert resp.status_code == 202
    assert resp.json()["detail"] == "Refresh started"


# ---------------------------------------------------------------------------
# Preview counts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_preview_counts(mock_tg, real_db_app, mock_bg_tasks, client):
    db = real_db_app
    await upsert_sync_state(db, chat_id=1, chat_name="G1", active=True, last_msg_id=10)

    result_mock = MagicMock()
    result_mock.total = 5
    mock_tg.client.get_messages = AsyncMock(return_value=result_mock)

    # Clear the module-level cache to avoid stale results from other tests
    from routes.groups import _preview_cache
    _preview_cache.clear()

    resp = await client.get("/groups/preview-counts")
    assert resp.status_code == 200
    data = resp.json()
    assert "1" in data
    assert data["1"]["total"] == 15  # 5 photos + 5 videos + 5 documents


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sync_group_starts(mock_tg, mock_db, mock_bg_tasks, mock_sync_status, client):
    """POST /groups/{id}/sync returns 202 and sets syncing status."""
    with patch("routes.groups._run_sync", new_callable=AsyncMock):
        resp = await client.post("/groups/1/sync")
    assert resp.status_code == 202
    assert resp.json()["started"] == 1
    assert mock_sync_status[1]["status"] == "syncing"


@pytest.mark.asyncio
async def test_sync_group_409_when_already_running(mock_tg, mock_db, mock_bg_tasks, mock_sync_status, client):
    """POST /groups/{id}/sync returns 409 when sync already running."""
    mock_sync_status[1] = {"status": "syncing", "progress": 5, "total": 10}
    resp = await client.post("/groups/1/sync")
    assert resp.status_code == 409
    assert "already in progress" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_sync_status_idle(mock_tg, mock_db, mock_bg_tasks, mock_sync_status, client):
    """GET /groups/{id}/sync-status returns idle when no sync is running."""
    resp = await client.get("/groups/999/sync-status")
    assert resp.status_code == 200
    assert resp.json()["status"] == "idle"


@pytest.mark.asyncio
async def test_sync_status_syncing(mock_tg, mock_db, mock_bg_tasks, mock_sync_status, client):
    """GET /groups/{id}/sync-status reflects in-progress status."""
    mock_sync_status[1] = {"status": "syncing", "progress": 3, "total": 10}
    resp = await client.get("/groups/1/sync-status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "syncing"
    assert data["progress"] == 3
    assert data["total"] == 10


# ---------------------------------------------------------------------------
# Sync all
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sync_all(mock_tg, mock_db, mock_bg_tasks, mock_sync_status, client):
    """POST /groups/sync-all starts sync for multiple chats."""
    with patch("routes.groups._run_sync", new_callable=AsyncMock):
        resp = await client.post("/groups/sync-all", json={"chat_ids": [1, 2, 3]})
    assert resp.status_code == 202
    data = resp.json()
    assert set(data["started"]) == {1, 2, 3}


@pytest.mark.asyncio
async def test_sync_all_skips_already_syncing(mock_tg, mock_db, mock_bg_tasks, mock_sync_status, client):
    """sync-all skips chats that already have syncing status."""
    mock_sync_status[2] = {"status": "syncing", "progress": 0, "total": 0}
    with patch("routes.groups._run_sync", new_callable=AsyncMock):
        resp = await client.post("/groups/sync-all", json={"chat_ids": [1, 2, 3]})
    assert resp.status_code == 202
    data = resp.json()
    assert 2 not in data["started"]
    assert 1 in data["started"]
    assert 3 in data["started"]


# ---------------------------------------------------------------------------
# Clear media
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_clear_chat_media(mock_tg, real_db_app, mock_bg_tasks, client):
    """DELETE /groups/{id}/media clears media and unlinks files."""
    db = real_db_app
    # Seed sync state so clear has something to reset
    await upsert_sync_state(db, chat_id=1, chat_name="G1", active=True, last_msg_id=10)

    with patch("routes.groups.Path") as MockPath:
        mock_path_instance = MagicMock()
        MockPath.return_value = mock_path_instance
        resp = await client.delete("/groups/1/media")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_clear_all_media(mock_tg, real_db_app, mock_bg_tasks, client):
    """DELETE /groups/media clears all media."""
    resp = await client.delete("/groups/media")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ---------------------------------------------------------------------------
# Hidden dialogs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hide_group(mock_tg, real_db_app, mock_bg_tasks, client):
    db = real_db_app
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "G1", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
    ])
    resp = await client.post("/groups/1/hide")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_unhide_group(mock_tg, real_db_app, mock_bg_tasks, client):
    db = real_db_app
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "G1", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
    ])
    await hide_dialog(db, 1)
    resp = await client.post("/groups/1/unhide")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_list_hidden_groups(mock_tg, real_db_app, mock_bg_tasks, client):
    db = real_db_app
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "G1", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
        {"id": 2, "name": "G2", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
    ])
    await hide_dialog(db, 1)

    resp = await client.get("/groups/hidden")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == 1


@pytest.mark.asyncio
async def test_hidden_group_count(mock_tg, real_db_app, mock_bg_tasks, client):
    db = real_db_app
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "G1", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
        {"id": 2, "name": "G2", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
    ])
    await hide_dialog(db, 1)
    await hide_dialog(db, 2)

    resp = await client.get("/groups/hidden/count")
    assert resp.status_code == 200
    assert resp.json()["count"] == 2


@pytest.mark.asyncio
async def test_unhide_batch(mock_tg, real_db_app, mock_bg_tasks, client):
    db = real_db_app
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "G1", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
        {"id": 2, "name": "G2", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
    ])
    await hide_dialog(db, 1)
    await hide_dialog(db, 2)

    resp = await client.post("/groups/unhide-batch", json={"dialog_ids": [1, 2]})
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # Verify they are no longer hidden
    resp2 = await client.get("/groups/hidden/count")
    assert resp2.json()["count"] == 0


# ---------------------------------------------------------------------------
# Unsync
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unsync_group(mock_tg, real_db_app, mock_bg_tasks, mock_sync_status, client):
    """POST /groups/{id}/unsync clears media, deactivates group, returns success."""
    db = real_db_app
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "G1", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
    ])
    await upsert_sync_state(db, chat_id=1, chat_name="G1", active=True, last_msg_id=50)

    with patch("routes.groups.Path") as MockPath:
        mock_path_instance = MagicMock()
        MockPath.return_value = mock_path_instance
        resp = await client.post("/groups/1/unsync")
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # Verify group is now inactive with reset sync state
    state = await get_sync_state(db, 1)
    assert state["active"] == 0
    assert state["last_msg_id"] == 0
    assert state["last_synced"] is None


@pytest.mark.asyncio
async def test_unsync_group_409_during_sync(mock_tg, mock_db, mock_bg_tasks, mock_sync_status, client):
    """POST /groups/{id}/unsync returns 409 when sync is in progress."""
    mock_sync_status[1] = {"status": "syncing", "progress": 5, "total": 10}
    resp = await client.post("/groups/1/unsync")
    assert resp.status_code == 409
    assert "sync is in progress" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_unsync_group_never_synced(mock_tg, real_db_app, mock_bg_tasks, mock_sync_status, client):
    """POST /groups/{id}/unsync on a never-synced group is a no-op success."""
    resp = await client.post("/groups/999/unsync")
    assert resp.status_code == 200
    assert resp.json()["success"] is True
