from __future__ import annotations

import json
import pytest
import aiosqlite
from database import (
    export_settings,
    import_settings,
    init_db,
    insert_media_item,
)
from tests.helpers import make_media_item
from utils import utc_now_iso


async def _seed_for_export(db: aiosqlite.Connection):
    """Insert dialogs, sync_state, media, and persons with various states."""
    now = utc_now_iso()
    # Hidden dialog
    await db.execute(
        "INSERT INTO dialogs (id, name, type, hidden_at, updated_at) VALUES (100, 'Hidden Chat', 'group', ?, ?)",
        [now, now],
    )
    # Visible dialog
    await db.execute(
        "INSERT INTO dialogs (id, name, type, updated_at) VALUES (200, 'Visible Chat', 'group', ?)",
        [now],
    )
    # Inactive sync_state
    await db.execute(
        "INSERT INTO sync_state (chat_id, chat_name, active) VALUES (100, 'Hidden Chat', 0)",
    )
    # Active sync_state
    await db.execute(
        "INSERT INTO sync_state (chat_id, chat_name, active) VALUES (200, 'Visible Chat', 1)",
    )
    # Hidden media (insert then UPDATE since insert_media_item doesn't set hidden_at)
    await insert_media_item(db, make_media_item(message_id=1, chat_id=100))
    await db.execute(
        "UPDATE media_items SET hidden_at = ? WHERE message_id = 1 AND chat_id = 100", [now]
    )
    # Favorited media (same pattern)
    await insert_media_item(db, make_media_item(message_id=2, chat_id=100))
    await db.execute(
        "UPDATE media_items SET favorited_at = ? WHERE message_id = 2 AND chat_id = 100", [now]
    )
    # Normal media
    await insert_media_item(
        db, make_media_item(message_id=3, chat_id=200)
    )
    # Named person
    await db.execute(
        "INSERT INTO persons (id, name, face_count, created_at, updated_at) VALUES (1, 'Alice', 5, ?, ?)",
        [now, now],
    )
    # Unnamed person
    await db.execute(
        "INSERT INTO persons (id, name, face_count, created_at, updated_at) VALUES (2, NULL, 3, ?, ?)",
        [now, now],
    )
    await db.commit()


@pytest.mark.asyncio
async def test_export_settings(db):
    await _seed_for_export(db)
    result = await export_settings(db)

    assert result["version"] == 1
    assert "exported_at" in result
    assert len(result["hidden_groups"]) == 1
    assert result["hidden_groups"][0]["chat_id"] == 100
    assert len(result["inactive_groups"]) == 1
    assert result["inactive_groups"][0]["chat_id"] == 100
    assert len(result["hidden_media"]) == 1
    assert result["hidden_media"][0]["message_id"] == 1
    assert result["hidden_media"][0]["chat_id"] == 100
    assert len(result["favorited_media"]) == 1
    assert result["favorited_media"][0]["message_id"] == 2
    assert len(result["person_names"]) == 1
    assert result["person_names"][0]["name"] == "Alice"


@pytest.mark.asyncio
async def test_export_empty_db(db):
    result = await export_settings(db)
    assert result["version"] == 1
    for key in ("hidden_groups", "inactive_groups", "hidden_media", "favorited_media", "person_names"):
        assert result[key] == []


@pytest.mark.asyncio
async def test_import_hidden_groups(db):
    now = utc_now_iso()
    await db.execute(
        "INSERT INTO dialogs (id, name, type, updated_at) VALUES (100, 'Chat', 'group', ?)", [now]
    )
    await db.commit()

    data = {"version": 1, "hidden_groups": [{"chat_id": 100, "hidden_at": now}],
            "inactive_groups": [], "hidden_media": [], "favorited_media": [], "person_names": []}
    result = await import_settings(db, data)

    assert result["applied"]["hidden_groups"] == 1
    row = await (await db.execute("SELECT hidden_at FROM dialogs WHERE id = 100")).fetchone()
    assert row["hidden_at"] is not None


@pytest.mark.asyncio
async def test_import_skips_already_hidden(db):
    now = utc_now_iso()
    await db.execute(
        "INSERT INTO dialogs (id, name, type, hidden_at, updated_at) VALUES (100, 'Chat', 'group', ?, ?)",
        [now, now],
    )
    await db.commit()

    data = {"version": 1, "hidden_groups": [{"chat_id": 100, "hidden_at": now}],
            "inactive_groups": [], "hidden_media": [], "favorited_media": [], "person_names": []}
    result = await import_settings(db, data)

    assert result["applied"]["hidden_groups"] == 0
    assert result["skipped"]["already_set"] == 1


@pytest.mark.asyncio
async def test_import_unknown_ids(db):
    data = {"version": 1, "hidden_groups": [{"chat_id": 999, "hidden_at": utc_now_iso()}],
            "inactive_groups": [], "hidden_media": [], "favorited_media": [], "person_names": []}
    result = await import_settings(db, data)

    assert result["skipped"]["unknown_ids"] == 1


@pytest.mark.asyncio
async def test_import_inactive_groups(db):
    now = utc_now_iso()
    await db.execute(
        "INSERT INTO sync_state (chat_id, chat_name, active) VALUES (100, 'Chat', 1)"
    )
    await db.commit()

    data = {"version": 1, "hidden_groups": [],
            "inactive_groups": [{"chat_id": 100}],
            "hidden_media": [], "favorited_media": [], "person_names": []}
    result = await import_settings(db, data)

    assert result["applied"]["inactive_groups"] == 1
    row = await (await db.execute("SELECT active FROM sync_state WHERE chat_id = 100")).fetchone()
    assert row["active"] == 0


@pytest.mark.asyncio
async def test_import_hidden_media(db):
    await insert_media_item(db, make_media_item(message_id=10, chat_id=100))
    now = utc_now_iso()

    data = {"version": 1, "hidden_groups": [], "inactive_groups": [],
            "hidden_media": [{"message_id": 10, "chat_id": 100, "hidden_at": now}],
            "favorited_media": [], "person_names": []}
    result = await import_settings(db, data)

    assert result["applied"]["hidden_media"] == 1
    row = await (await db.execute(
        "SELECT hidden_at FROM media_items WHERE message_id = 10 AND chat_id = 100"
    )).fetchone()
    assert row["hidden_at"] is not None


@pytest.mark.asyncio
async def test_import_favorited_media(db):
    await insert_media_item(db, make_media_item(message_id=10, chat_id=100))
    now = utc_now_iso()

    data = {"version": 1, "hidden_groups": [], "inactive_groups": [],
            "hidden_media": [], "person_names": [],
            "favorited_media": [{"message_id": 10, "chat_id": 100, "favorited_at": now}]}
    result = await import_settings(db, data)

    assert result["applied"]["favorited_media"] == 1


@pytest.mark.asyncio
async def test_import_person_names_no_overwrite(db):
    now = utc_now_iso()
    await db.execute(
        "INSERT INTO persons (id, name, face_count, created_at, updated_at) VALUES (1, 'Alice', 5, ?, ?)",
        [now, now],
    )
    await db.commit()

    data = {"version": 1, "hidden_groups": [], "inactive_groups": [],
            "hidden_media": [], "favorited_media": [],
            "person_names": [{"person_id": 1, "name": "Bob"}]}
    result = await import_settings(db, data)

    assert result["applied"]["person_names"] == 0
    assert result["skipped"]["already_set"] == 1
    row = await (await db.execute("SELECT name FROM persons WHERE id = 1")).fetchone()
    assert row["name"] == "Alice"


@pytest.mark.asyncio
async def test_import_roundtrip(db):
    await _seed_for_export(db)
    exported = await export_settings(db)
    # Re-import into same db — everything should be already_set
    result = await import_settings(db, exported)
    for v in result["applied"].values():
        assert v == 0
    assert result["skipped"]["already_set"] > 0


# ── Route tests ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_route(real_db_app, client, mock_tg, mock_bg_tasks):
    await _seed_for_export(real_db_app)
    resp = await client.get("/settings/export")
    assert resp.status_code == 200
    assert "attachment" in resp.headers.get("content-disposition", "")
    data = resp.json()
    assert data["version"] == 1
    assert len(data["hidden_groups"]) == 1


@pytest.mark.asyncio
async def test_import_route(real_db_app, client, mock_tg, mock_bg_tasks):
    now = utc_now_iso()
    await real_db_app.execute(
        "INSERT INTO dialogs (id, name, type, updated_at) VALUES (100, 'Chat', 'group', ?)", [now]
    )
    await real_db_app.commit()

    payload = json.dumps({
        "version": 1,
        "hidden_groups": [{"chat_id": 100, "hidden_at": now}],
        "inactive_groups": [], "hidden_media": [],
        "favorited_media": [], "person_names": [],
    })
    resp = await client.post(
        "/settings/import",
        files={"file": ("settings.json", payload.encode(), "application/json")},
    )
    assert resp.status_code == 200
    assert resp.json()["applied"]["hidden_groups"] == 1


@pytest.mark.asyncio
async def test_import_invalid_json(real_db_app, client, mock_tg, mock_bg_tasks):
    resp = await client.post(
        "/settings/import",
        files={"file": ("settings.json", b"not json", "application/json")},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_import_missing_version(real_db_app, client, mock_tg, mock_bg_tasks):
    resp = await client.post(
        "/settings/import",
        files={"file": ("settings.json", b'{"hidden_groups": []}', "application/json")},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_import_unsupported_version(real_db_app, client, mock_tg, mock_bg_tasks):
    resp = await client.post(
        "/settings/import",
        files={"file": ("settings.json", json.dumps({"version": 99}).encode(), "application/json")},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_import_file_too_large(real_db_app, client, mock_tg, mock_bg_tasks):
    large_content = b"x" * (10 * 1024 * 1024 + 1)
    resp = await client.post(
        "/settings/import",
        files={"file": ("settings.json", large_content, "application/json")},
    )
    assert resp.status_code == 413
