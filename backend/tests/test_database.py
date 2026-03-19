import asyncio
import pytest
from database import (
    insert_media_item,
    insert_media_batch,
    update_sync_progress,
    get_media_page,
    upsert_sync_state,
    get_sync_state,
    get_all_sync_states,
    update_file_ref,
    clear_chat_media,
    clear_all_media,
    get_media_by_ids,
    get_media_by_id,
    hide_media_item,
    hide_media_items,
    unhide_media_items,
    get_hidden_media_page,
    get_hidden_count,
    favorite_media_item,
    favorite_media_items,
    unfavorite_media_items,
    unfavorite_media_item,
    get_favorites_media_page,
    get_favorites_count,
    get_media_count,
    upsert_dialogs_batch,
    get_all_dialogs,
    hide_dialog,
    unhide_dialogs,
    get_hidden_dialogs,
    get_hidden_dialog_count,
    insert_faces_batch,
    mark_media_scanned,
    get_all_face_embeddings,
    clear_person_assignments,
    bulk_assign_persons,
    get_all_persons,
    get_person,
    rename_person,
    merge_persons,
    merge_persons_batch,
    remove_face_from_person,
    get_person_media_page,
    get_face_scan_state,
    update_face_scan_state,
    get_person_embeddings,
    get_person_count,
    get_unscanned_photos,
    get_unscanned_photo_count,
    get_total_photo_count,
)
from helpers import make_media_item
from utils import utc_now_iso


# ---------------------------------------------------------------------------
# Existing tests (kept as-is)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_init_db_creates_tables(db):
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    tables = [row[0] for row in await cursor.fetchall()]
    assert "media_items" in tables
    assert "sync_state" in tables


@pytest.mark.asyncio
async def test_insert_and_query_media(db):
    item = {
        "message_id": 100,
        "chat_id": 1,
        "chat_name": "Test Group",
        "date": "2026-03-15T10:00:00",
        "media_type": "photo",
        "mime_type": "image/jpeg",
        "file_size": 50000,
        "width": 800,
        "height": 600,
        "duration": None,
        "caption": "test photo",
        "file_id": 12345,
        "access_hash": 67890,
        "file_ref": b"ref123",
        "thumbnail_path": None,
        "sender_name": None,
    }
    await insert_media_item(db, item)
    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1
    assert rows[0]["message_id"] == 100
    assert rows[0]["chat_name"] == "Test Group"


@pytest.mark.asyncio
async def test_cursor_pagination(db):
    for i in range(5):
        await insert_media_item(
            db,
            {
                "message_id": i,
                "chat_id": 1,
                "chat_name": "G",
                "date": f"2026-03-{15 - i}T10:00:00",
                "media_type": "photo",
                "mime_type": "image/jpeg",
                "file_size": 100,
                "width": 100,
                "height": 100,
                "duration": None,
                "caption": None,
                "file_id": i,
                "access_hash": i,
                "file_ref": b"ref",
                "thumbnail_path": None,
                "sender_name": None,
            },
        )
    page1 = await get_media_page(db, cursor_id=None, limit=3)
    assert len(page1) == 3
    last_id = page1[-1]["id"]
    page2 = await get_media_page(db, cursor_id=last_id, limit=3)
    assert len(page2) == 2


@pytest.mark.asyncio
async def test_filter_by_groups(db):
    for chat_id in [1, 2]:
        await insert_media_item(
            db,
            {
                "message_id": chat_id * 10,
                "chat_id": chat_id,
                "chat_name": f"G{chat_id}",
                "date": "2026-03-15T10:00:00",
                "media_type": "photo",
                "mime_type": "image/jpeg",
                "file_size": 100,
                "width": 100,
                "height": 100,
                "duration": None,
                "caption": None,
                "file_id": chat_id,
                "access_hash": chat_id,
                "file_ref": b"ref",
                "thumbnail_path": None,
                "sender_name": None,
            },
        )
    rows = await get_media_page(db, cursor_id=None, limit=10, group_ids=[1])
    assert len(rows) == 1
    assert rows[0]["chat_id"] == 1


@pytest.mark.asyncio
async def test_filter_by_media_type(db):
    for mtype in ["photo", "video"]:
        await insert_media_item(
            db,
            {
                "message_id": hash(mtype) % 10000,
                "chat_id": 1,
                "chat_name": "G",
                "date": "2026-03-15T10:00:00",
                "media_type": mtype,
                "mime_type": f"{'image' if mtype == 'photo' else 'video'}/mp4",
                "file_size": 100,
                "width": 100,
                "height": 100,
                "duration": 10.0 if mtype == "video" else None,
                "caption": None,
                "file_id": hash(mtype) % 10000,
                "access_hash": 1,
                "file_ref": b"ref",
                "thumbnail_path": None,
                "sender_name": None,
            },
        )
    rows = await get_media_page(db, cursor_id=None, limit=10, media_type="video")
    assert len(rows) == 1
    assert rows[0]["media_type"] == "video"


@pytest.mark.asyncio
async def test_sync_state_upsert_and_get(db):
    await upsert_sync_state(
        db, chat_id=1, chat_name="Test", active=True, last_msg_id=500
    )
    state = await get_sync_state(db, chat_id=1)
    assert state is not None
    assert state["active"] == 1
    assert state["last_msg_id"] == 500
    # Update
    await upsert_sync_state(
        db, chat_id=1, chat_name="Test", active=True, last_msg_id=600
    )
    state = await get_sync_state(db, chat_id=1)
    assert state is not None
    assert state["last_msg_id"] == 600


@pytest.mark.asyncio
async def test_duplicate_media_ignored(db):
    item = {
        "message_id": 100,
        "chat_id": 1,
        "chat_name": "G",
        "date": "2026-03-15T10:00:00",
        "media_type": "photo",
        "mime_type": "image/jpeg",
        "file_size": 100,
        "width": 100,
        "height": 100,
        "duration": None,
        "caption": None,
        "file_id": 1,
        "access_hash": 1,
        "file_ref": b"ref",
        "thumbnail_path": None,
        "sender_name": None,
    }
    await insert_media_item(db, item)
    await insert_media_item(db, item)  # should not raise
    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1


# ---------------------------------------------------------------------------
# 1. insert_media_batch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_insert_media_batch_empty(db):
    """Empty list is a no-op."""
    await insert_media_batch(db, [])
    rows = await get_media_page(db, limit=10)
    assert len(rows) == 0


@pytest.mark.asyncio
async def test_insert_media_batch_multiple(db):
    items = [
        make_media_item(message_id=i, file_id=i, access_hash=i)
        for i in range(5)
    ]
    await insert_media_batch(db, items)
    rows = await get_media_page(db, limit=10)
    assert len(rows) == 5


@pytest.mark.asyncio
async def test_insert_media_batch_duplicates_ignored(db):
    item = make_media_item(message_id=1, chat_id=1)
    await insert_media_batch(db, [item, item])
    rows = await get_media_page(db, limit=10)
    assert len(rows) == 1


# ---------------------------------------------------------------------------
# 2. update_sync_progress
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_sync_progress_bumps_last_msg_id(db):
    await upsert_sync_state(db, chat_id=1, chat_name="G", active=True, last_msg_id=100)
    await update_sync_progress(db, chat_id=1, last_msg_id=200)
    state = await get_sync_state(db, 1)
    assert state["last_msg_id"] == 200


@pytest.mark.asyncio
async def test_update_sync_progress_max_prevents_rewind(db):
    await upsert_sync_state(db, chat_id=1, chat_name="G", active=True, last_msg_id=500)
    await update_sync_progress(db, chat_id=1, last_msg_id=300)
    state = await get_sync_state(db, 1)
    assert state["last_msg_id"] == 500


# ---------------------------------------------------------------------------
# 3. Composite cursor pagination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_composite_cursor_pagination(db):
    """cursor_value + cursor_id uses composite keyset pagination."""
    # Insert items with distinct dates so ordering is deterministic
    for i in range(5):
        await insert_media_item(
            db,
            make_media_item(
                message_id=i,
                file_id=i,
                access_hash=i,
                date=f"2026-03-{15 - i:02d}T10:00:00",
            ),
        )
    page1 = await get_media_page(db, limit=2)
    assert len(page1) == 2
    last = page1[-1]
    # Use composite cursor
    page2 = await get_media_page(
        db, cursor_id=last["id"], cursor_value=last["date"], limit=10
    )
    assert len(page2) == 3
    # No overlap
    page1_ids = {r["id"] for r in page1}
    page2_ids = {r["id"] for r in page2}
    assert page1_ids.isdisjoint(page2_ids)


# ---------------------------------------------------------------------------
# 4. Date filtering
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_date_from_only(db):
    await insert_media_batch(db, [
        make_media_item(message_id=1, file_id=1, date="2026-03-10T10:00:00"),
        make_media_item(message_id=2, file_id=2, date="2026-03-15T10:00:00"),
    ])
    rows = await get_media_page(db, limit=10, date_from="2026-03-12")
    assert len(rows) == 1
    assert rows[0]["message_id"] == 2


@pytest.mark.asyncio
async def test_date_to_only(db):
    await insert_media_batch(db, [
        make_media_item(message_id=1, file_id=1, date="2026-03-10T10:00:00"),
        make_media_item(message_id=2, file_id=2, date="2026-03-15T10:00:00"),
    ])
    # date_to="2026-03-10" → exclusive is 2026-03-11, so includes the 10th
    rows = await get_media_page(db, limit=10, date_to="2026-03-10")
    assert len(rows) == 1
    assert rows[0]["message_id"] == 1


@pytest.mark.asyncio
async def test_date_from_and_to(db):
    await insert_media_batch(db, [
        make_media_item(message_id=1, file_id=1, date="2026-03-05T10:00:00"),
        make_media_item(message_id=2, file_id=2, date="2026-03-10T10:00:00"),
        make_media_item(message_id=3, file_id=3, date="2026-03-20T10:00:00"),
    ])
    rows = await get_media_page(db, limit=10, date_from="2026-03-08", date_to="2026-03-15")
    assert len(rows) == 1
    assert rows[0]["message_id"] == 2


# ---------------------------------------------------------------------------
# 5. Face filters
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_face_filter_none(db):
    await insert_media_batch(db, [
        make_media_item(message_id=1, file_id=1),
        make_media_item(message_id=2, file_id=2),
    ])
    # Manually set face_count
    await db.execute("UPDATE media_items SET face_count = 0 WHERE message_id = 1")
    await db.execute("UPDATE media_items SET face_count = 2 WHERE message_id = 2")
    await db.commit()
    rows = await get_media_page(db, limit=10, faces="none")
    assert len(rows) == 1
    assert rows[0]["face_count"] == 0


@pytest.mark.asyncio
async def test_face_filter_solo(db):
    await insert_media_item(db, make_media_item(message_id=1, file_id=1))
    await db.execute("UPDATE media_items SET face_count = 1 WHERE message_id = 1")
    await db.commit()
    rows = await get_media_page(db, limit=10, faces="solo")
    assert len(rows) == 1
    assert rows[0]["face_count"] == 1


@pytest.mark.asyncio
async def test_face_filter_group(db):
    await insert_media_batch(db, [
        make_media_item(message_id=1, file_id=1),
        make_media_item(message_id=2, file_id=2),
    ])
    await db.execute("UPDATE media_items SET face_count = 1 WHERE message_id = 1")
    await db.execute("UPDATE media_items SET face_count = 3 WHERE message_id = 2")
    await db.commit()
    rows = await get_media_page(db, limit=10, faces="group")
    assert len(rows) == 1
    assert rows[0]["face_count"] == 3


# ---------------------------------------------------------------------------
# 6. Hidden media
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hide_media_item(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=10))[0]
    await hide_media_item(db, row["id"])
    assert len(await get_media_page(db, limit=10)) == 0
    assert await get_hidden_count(db) == 1


@pytest.mark.asyncio
async def test_hide_media_items_batch(db):
    await insert_media_batch(db, [
        make_media_item(message_id=i, file_id=i) for i in range(3)
    ])
    rows = await get_media_page(db, limit=10)
    ids = [r["id"] for r in rows]
    await hide_media_items(db, ids[:2])
    assert len(await get_media_page(db, limit=10)) == 1
    assert await get_hidden_count(db) == 2


@pytest.mark.asyncio
async def test_unhide_media_items(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=10))[0]
    await hide_media_item(db, row["id"])
    assert await get_hidden_count(db) == 1
    await unhide_media_items(db, [row["id"]])
    assert await get_hidden_count(db) == 0
    assert len(await get_media_page(db, limit=10)) == 1


@pytest.mark.asyncio
async def test_get_hidden_media_page(db):
    await insert_media_batch(db, [
        make_media_item(message_id=i, file_id=i) for i in range(3)
    ])
    rows = await get_media_page(db, limit=10)
    await hide_media_items(db, [rows[0]["id"], rows[1]["id"]])
    hidden_page = await get_hidden_media_page(db, limit=10)
    assert len(hidden_page) == 2


@pytest.mark.asyncio
async def test_hidden_excluded_from_get_media_page(db):
    await insert_media_batch(db, [
        make_media_item(message_id=i, file_id=i) for i in range(3)
    ])
    rows = await get_media_page(db, limit=10)
    await hide_media_item(db, rows[0]["id"])
    visible = await get_media_page(db, limit=10)
    assert len(visible) == 2
    assert all(r["hidden_at"] is None for r in visible)


# ---------------------------------------------------------------------------
# 7. Favorites
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_favorite_media_item(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=10))[0]
    await favorite_media_item(db, row["id"])
    assert await get_favorites_count(db) == 1


@pytest.mark.asyncio
async def test_favorite_media_items_batch(db):
    await insert_media_batch(db, [
        make_media_item(message_id=i, file_id=i) for i in range(3)
    ])
    rows = await get_media_page(db, limit=10)
    await favorite_media_items(db, [r["id"] for r in rows[:2]])
    assert await get_favorites_count(db) == 2


@pytest.mark.asyncio
async def test_unfavorite_media_item(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=10))[0]
    await favorite_media_item(db, row["id"])
    await unfavorite_media_item(db, row["id"])
    assert await get_favorites_count(db) == 0


@pytest.mark.asyncio
async def test_unfavorite_media_items_batch(db):
    await insert_media_batch(db, [
        make_media_item(message_id=i, file_id=i) for i in range(3)
    ])
    rows = await get_media_page(db, limit=10)
    ids = [r["id"] for r in rows]
    await favorite_media_items(db, ids)
    await unfavorite_media_items(db, ids[:2])
    assert await get_favorites_count(db) == 1


@pytest.mark.asyncio
async def test_get_favorites_media_page(db):
    await insert_media_batch(db, [
        make_media_item(message_id=i, file_id=i) for i in range(3)
    ])
    rows = await get_media_page(db, limit=10)
    await favorite_media_items(db, [rows[0]["id"]])
    fav_page = await get_favorites_media_page(db, limit=10)
    assert len(fav_page) == 1
    assert fav_page[0]["id"] == rows[0]["id"]


# ---------------------------------------------------------------------------
# 8. get_media_count
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_media_count_excludes_hidden(db):
    await insert_media_batch(db, [
        make_media_item(message_id=i, file_id=i) for i in range(5)
    ])
    assert await get_media_count(db) == 5
    rows = await get_media_page(db, limit=10)
    await hide_media_item(db, rows[0]["id"])
    assert await get_media_count(db) == 4


@pytest.mark.asyncio
async def test_get_media_count_excludes_hidden_dialog(db):
    """Media from a hidden dialog is excluded from count."""
    await insert_media_batch(db, [
        make_media_item(message_id=1, file_id=1, chat_id=10),
        make_media_item(message_id=2, file_id=2, chat_id=20),
    ])
    await upsert_dialogs_batch(db, [
        {"id": 10, "name": "Chat10", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15"},
    ])
    await hide_dialog(db, 10)
    assert await get_media_count(db) == 1


# ---------------------------------------------------------------------------
# 9. Face CRUD
# ---------------------------------------------------------------------------


def _make_face(media_id, confidence=0.9, embedding=b"emb"):
    now = utc_now_iso()
    return {
        "media_id": media_id,
        "embedding": embedding,
        "bbox_x": 0.1,
        "bbox_y": 0.1,
        "bbox_w": 0.3,
        "bbox_h": 0.3,
        "confidence": confidence,
        "crop_path": None,
        "created_at": now,
    }


@pytest.mark.asyncio
async def test_insert_faces_batch_returns_ids(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    faces = [_make_face(row["id"]) for _ in range(3)]
    ids = await insert_faces_batch(db, faces)
    assert len(ids) == 3
    assert len(set(ids)) == 3  # all unique


@pytest.mark.asyncio
async def test_insert_faces_batch_empty(db):
    ids = await insert_faces_batch(db, [])
    assert ids == []


@pytest.mark.asyncio
async def test_mark_media_scanned(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    await mark_media_scanned(db, [row["id"]], face_counts={row["id"]: 2})
    updated = await get_media_by_id(db, row["id"])
    assert updated["faces_scanned"] == 1
    assert updated["face_count"] == 2


@pytest.mark.asyncio
async def test_mark_media_scanned_no_face_counts(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    await mark_media_scanned(db, [row["id"]])
    updated = await get_media_by_id(db, row["id"])
    assert updated["faces_scanned"] == 1
    assert updated["face_count"] == 0


@pytest.mark.asyncio
async def test_get_all_face_embeddings_filters_low_confidence(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    faces = [
        _make_face(row["id"], confidence=0.9),
        _make_face(row["id"], confidence=0.3),  # below 0.5 threshold
    ]
    await insert_faces_batch(db, faces)
    await db.commit()
    embeddings = await get_all_face_embeddings(db)
    assert len(embeddings) == 1


# ---------------------------------------------------------------------------
# 10. Person lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bulk_assign_persons(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"]) for _ in range(3)])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids[:2], "representative_face_id": face_ids[0]},
        {"face_ids": [face_ids[2]], "representative_face_id": face_ids[2]},
    ])
    persons = await get_all_persons(db)
    assert len(persons) == 2
    counts = sorted([p["face_count"] for p in persons])
    assert counts == [1, 2]


@pytest.mark.asyncio
async def test_get_all_persons_display_name(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"])])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids, "representative_face_id": face_ids[0]},
    ])
    persons = await get_all_persons(db)
    assert len(persons) == 1
    # No name set, display_name should be "Person {id}"
    assert persons[0]["display_name"] == f"Person {persons[0]['id']}"


@pytest.mark.asyncio
async def test_get_person(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"])])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids, "representative_face_id": face_ids[0]},
    ])
    persons = await get_all_persons(db)
    person = await get_person(db, persons[0]["id"])
    assert person is not None
    assert person["face_count"] == 1


@pytest.mark.asyncio
async def test_get_person_not_found(db):
    person = await get_person(db, 9999)
    assert person is None


@pytest.mark.asyncio
async def test_rename_person(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"])])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids, "representative_face_id": face_ids[0]},
    ])
    persons = await get_all_persons(db)
    pid = persons[0]["id"]
    await rename_person(db, pid, "Alice")
    person = await get_person(db, pid)
    assert person["name"] == "Alice"
    assert person["display_name"] == "Alice"


# ---------------------------------------------------------------------------
# 11. Merge
# ---------------------------------------------------------------------------


async def _setup_two_persons(db):
    """Helper: create 2 persons with 2 and 1 faces respectively."""
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"]) for _ in range(3)])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids[:2], "representative_face_id": face_ids[0]},
        {"face_ids": [face_ids[2]], "representative_face_id": face_ids[2]},
    ])
    persons = await get_all_persons(db)
    # Sort so person_a has more faces
    persons.sort(key=lambda p: p["face_count"], reverse=True)
    return persons[0]["id"], persons[1]["id"]


@pytest.mark.asyncio
async def test_merge_persons(db):
    keep_id, merge_id = await _setup_two_persons(db)
    await merge_persons(db, keep_id, merge_id)
    assert await get_person_count(db) == 1
    person = await get_person(db, keep_id)
    assert person["face_count"] == 3


@pytest.mark.asyncio
async def test_merge_persons_batch(db):
    keep_id, merge_id = await _setup_two_persons(db)
    await merge_persons_batch(db, keep_id, [merge_id])
    assert await get_person_count(db) == 1
    person = await get_person(db, keep_id)
    assert person["face_count"] == 3


@pytest.mark.asyncio
async def test_merge_persons_batch_self_merge_guard(db):
    keep_id, _ = await _setup_two_persons(db)
    # Self-merge should be a no-op (keep_id in merge_ids is filtered out)
    await merge_persons_batch(db, keep_id, [keep_id])
    assert await get_person_count(db) == 2  # unchanged


# ---------------------------------------------------------------------------
# 12. remove_face_from_person
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_remove_face_from_person_decrement(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"]) for _ in range(2)])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids, "representative_face_id": face_ids[0]},
    ])
    persons = await get_all_persons(db)
    pid = persons[0]["id"]
    await remove_face_from_person(db, face_ids[0])
    person = await get_person(db, pid)
    assert person["face_count"] == 1


@pytest.mark.asyncio
async def test_remove_face_from_person_deletes_empty(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"])])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids, "representative_face_id": face_ids[0]},
    ])
    await remove_face_from_person(db, face_ids[0])
    assert await get_person_count(db) == 0


@pytest.mark.asyncio
async def test_remove_face_from_person_no_person_noop(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"])])
    # Face has no person_id, should be a no-op
    await remove_face_from_person(db, face_ids[0])
    # Just assert no error was raised


# ---------------------------------------------------------------------------
# 13. get_person_media_page
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_person_media_page(db):
    await insert_media_batch(db, [
        make_media_item(message_id=1, file_id=1, date="2026-03-15T10:00:00"),
        make_media_item(message_id=2, file_id=2, date="2026-03-14T10:00:00"),
    ])
    rows = await get_media_page(db, limit=10)
    media_id_1 = [r for r in rows if r["message_id"] == 1][0]["id"]
    _ = [r for r in rows if r["message_id"] == 2][0]["id"]
    # Faces on media_id_1 only
    face_ids = await insert_faces_batch(db, [_make_face(media_id_1)])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids, "representative_face_id": face_ids[0]},
    ])
    persons = await get_all_persons(db)
    pid = persons[0]["id"]
    page = await get_person_media_page(db, pid, limit=10)
    assert len(page) == 1
    assert page[0]["id"] == media_id_1


@pytest.mark.asyncio
async def test_get_person_media_page_excludes_hidden(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"])])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids, "representative_face_id": face_ids[0]},
    ])
    persons = await get_all_persons(db)
    pid = persons[0]["id"]
    await hide_media_item(db, row["id"])
    page = await get_person_media_page(db, pid, limit=10)
    assert len(page) == 0


# ---------------------------------------------------------------------------
# 14. Face scan state
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_face_scan_state_default(db):
    state = await get_face_scan_state(db)
    assert state["status"] == "idle"
    assert state["scanned_count"] == 0
    assert state["total_count"] == 0


@pytest.mark.asyncio
async def test_update_face_scan_state_creates_and_updates(db):
    await update_face_scan_state(db, status="running", total_count=100)
    state = await get_face_scan_state(db)
    assert state["status"] == "running"
    assert state["total_count"] == 100
    # Update again
    await update_face_scan_state(db, scanned_count=50)
    state = await get_face_scan_state(db)
    assert state["scanned_count"] == 50
    assert state["status"] == "running"  # unchanged


@pytest.mark.asyncio
async def test_update_face_scan_state_rejects_invalid_fields(db):
    with pytest.raises(ValueError, match="Invalid face_scan_state fields"):
        await update_face_scan_state(db, bogus_field="nope")


# ---------------------------------------------------------------------------
# 15. get_person_embeddings, get_person_count
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_person_embeddings(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"], embedding=b"vec1")])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids, "representative_face_id": face_ids[0]},
    ])
    embeddings = await get_person_embeddings(db)
    assert len(embeddings) == 1
    assert embeddings[0]["embedding"] == b"vec1"


@pytest.mark.asyncio
async def test_get_person_count(db):
    assert await get_person_count(db) == 0
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"])])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids, "representative_face_id": face_ids[0]},
    ])
    assert await get_person_count(db) == 1


# ---------------------------------------------------------------------------
# 16. Clear ops
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_clear_chat_media_returns_paths_and_resets_sync(db):
    await insert_media_item(db, make_media_item(
        message_id=1, chat_id=1, thumbnail_path="/tmp/thumb.jpg",
    ))
    # download_path is not part of insert_media_item columns; set it directly
    row = (await get_media_page(db, limit=1))[0]
    await db.execute("UPDATE media_items SET download_path = ? WHERE id = ?", ("/tmp/dl.jpg", row["id"]))
    await db.commit()
    await upsert_sync_state(db, chat_id=1, chat_name="G", active=True, last_msg_id=100)
    paths = await clear_chat_media(db, chat_id=1)
    assert "/tmp/thumb.jpg" in paths
    assert "/tmp/dl.jpg" in paths
    assert len(await get_media_page(db, limit=10)) == 0
    state = await get_sync_state(db, 1)
    assert state["last_msg_id"] == 0


@pytest.mark.asyncio
async def test_clear_chat_media_includes_face_crop_paths(db):
    await insert_media_item(db, make_media_item(message_id=1, chat_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face = _make_face(row["id"])
    face["crop_path"] = "/tmp/crop.jpg"
    await insert_faces_batch(db, [face])
    await db.commit()
    paths = await clear_chat_media(db, chat_id=1)
    assert "/tmp/crop.jpg" in paths


@pytest.mark.asyncio
async def test_clear_all_media(db):
    await insert_media_batch(db, [
        make_media_item(message_id=1, chat_id=1, file_id=1, thumbnail_path="/t1.jpg"),
        make_media_item(message_id=2, chat_id=2, file_id=2, thumbnail_path="/t2.jpg"),
    ])
    await upsert_sync_state(db, chat_id=1, chat_name="G1", active=True, last_msg_id=50)
    paths = await clear_all_media(db)
    assert "/t1.jpg" in paths
    assert "/t2.jpg" in paths
    assert len(await get_media_page(db, limit=10)) == 0
    state = await get_sync_state(db, 1)
    assert state["last_msg_id"] == 0


# ---------------------------------------------------------------------------
# 17. Lookups
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_media_by_ids(db):
    await insert_media_batch(db, [
        make_media_item(message_id=i, file_id=i) for i in range(3)
    ])
    rows = await get_media_page(db, limit=10)
    ids = [r["id"] for r in rows]
    result = await get_media_by_ids(db, ids[:2])
    assert len(result) == 2


@pytest.mark.asyncio
async def test_get_media_by_ids_empty(db):
    assert await get_media_by_ids(db, []) == []


@pytest.mark.asyncio
async def test_get_media_by_id_found(db):
    await insert_media_item(db, make_media_item(message_id=1))
    rows = await get_media_page(db, limit=1)
    result = await get_media_by_id(db, rows[0]["id"])
    assert result is not None
    assert result["message_id"] == 1


@pytest.mark.asyncio
async def test_get_media_by_id_not_found(db):
    result = await get_media_by_id(db, 9999)
    assert result is None


# ---------------------------------------------------------------------------
# 18. Face scan queries
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_unscanned_photos(db):
    await insert_media_batch(db, [
        make_media_item(message_id=1, file_id=1, media_type="photo"),
        make_media_item(message_id=2, file_id=2, media_type="photo"),
        make_media_item(message_id=3, file_id=3, media_type="video"),
    ])
    unscanned = await get_unscanned_photos(db, limit=10)
    # Only photos, not videos
    assert len(unscanned) == 2
    assert all(r["media_type"] == "photo" for r in unscanned)


@pytest.mark.asyncio
async def test_get_unscanned_photo_count(db):
    await insert_media_batch(db, [
        make_media_item(message_id=1, file_id=1, media_type="photo"),
        make_media_item(message_id=2, file_id=2, media_type="photo"),
    ])
    assert await get_unscanned_photo_count(db) == 2
    rows = await get_media_page(db, limit=10)
    await mark_media_scanned(db, [rows[0]["id"]])
    assert await get_unscanned_photo_count(db) == 1


@pytest.mark.asyncio
async def test_get_total_photo_count(db):
    await insert_media_batch(db, [
        make_media_item(message_id=1, file_id=1, media_type="photo"),
        make_media_item(message_id=2, file_id=2, media_type="video"),
    ])
    assert await get_total_photo_count(db) == 1


# ---------------------------------------------------------------------------
# 19. clear_person_assignments
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_clear_person_assignments(db):
    await insert_media_item(db, make_media_item(message_id=1))
    row = (await get_media_page(db, limit=1))[0]
    face_ids = await insert_faces_batch(db, [_make_face(row["id"])])
    await bulk_assign_persons(db, [
        {"face_ids": face_ids, "representative_face_id": face_ids[0]},
    ])
    assert await get_person_count(db) == 1
    await clear_person_assignments(db)
    assert await get_person_count(db) == 0
    # Faces still exist but have no person
    embs = await get_all_face_embeddings(db)
    assert len(embs) == 1


# ---------------------------------------------------------------------------
# 20. Dialogs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upsert_dialogs_batch(db):
    dialogs = [
        {"id": 1, "name": "Chat A", "type": "group", "unread_count": 5, "last_message_date": "2026-03-15T10:00:00"},
        {"id": 2, "name": "Chat B", "type": "channel", "unread_count": 0, "last_message_date": "2026-03-14T10:00:00"},
    ]
    await upsert_dialogs_batch(db, dialogs)
    all_d = await get_all_dialogs(db)
    assert len(all_d) == 2
    # Upsert again with updated name
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "Renamed Chat", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
    ])
    all_d = await get_all_dialogs(db)
    names = {d["name"] for d in all_d}
    assert "Renamed Chat" in names


@pytest.mark.asyncio
async def test_upsert_dialogs_batch_empty(db):
    await upsert_dialogs_batch(db, [])
    assert len(await get_all_dialogs(db)) == 0


@pytest.mark.asyncio
async def test_get_all_dialogs_excludes_hidden(db):
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "A", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15"},
        {"id": 2, "name": "B", "type": "group", "unread_count": 0, "last_message_date": "2026-03-14"},
    ])
    await hide_dialog(db, 1)
    visible = await get_all_dialogs(db)
    assert len(visible) == 1
    assert visible[0]["id"] == 2


@pytest.mark.asyncio
async def test_get_all_dialogs_excludes_no_date(db):
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "A", "type": "group", "unread_count": 0, "last_message_date": None},
        {"id": 2, "name": "B", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15"},
    ])
    visible = await get_all_dialogs(db)
    assert len(visible) == 1
    assert visible[0]["id"] == 2


# ---------------------------------------------------------------------------
# 21. Hidden dialogs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hide_dialog(db):
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "A", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15"},
    ])
    await hide_dialog(db, 1)
    assert await get_hidden_dialog_count(db) == 1


@pytest.mark.asyncio
async def test_unhide_dialogs(db):
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "A", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15"},
        {"id": 2, "name": "B", "type": "group", "unread_count": 0, "last_message_date": "2026-03-14"},
    ])
    await hide_dialog(db, 1)
    await hide_dialog(db, 2)
    assert await get_hidden_dialog_count(db) == 2
    await unhide_dialogs(db, [1, 2])
    assert await get_hidden_dialog_count(db) == 0


@pytest.mark.asyncio
async def test_get_hidden_dialogs(db):
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "A", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15"},
    ])
    await hide_dialog(db, 1)
    hidden = await get_hidden_dialogs(db)
    assert len(hidden) == 1
    assert hidden[0]["id"] == 1


# ---------------------------------------------------------------------------
# 22. update_file_ref
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_file_ref(db):
    await insert_media_item(db, make_media_item(message_id=1, file_ref=b"old_ref"))
    row = (await get_media_page(db, limit=1))[0]
    await update_file_ref(db, row["id"], b"new_ref")
    updated = await get_media_by_id(db, row["id"])
    assert updated["file_ref"] == b"new_ref"


# ---------------------------------------------------------------------------
# Additional edge-case tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_all_sync_states(db):
    await upsert_sync_state(db, chat_id=1, chat_name="A", active=True)
    await upsert_sync_state(db, chat_id=2, chat_name="B", active=False)
    states = await get_all_sync_states(db)
    assert len(states) == 2
    # Ordered by chat_name
    assert states[0]["chat_name"] == "A"
    assert states[1]["chat_name"] == "B"


@pytest.mark.asyncio
async def test_hide_media_items_empty_list(db):
    """Empty list should be a no-op."""
    await hide_media_items(db, [])


@pytest.mark.asyncio
async def test_unhide_media_items_empty_list(db):
    await unhide_media_items(db, [])


@pytest.mark.asyncio
async def test_favorite_media_items_empty_list(db):
    await favorite_media_items(db, [])


@pytest.mark.asyncio
async def test_unfavorite_media_items_empty_list(db):
    await unfavorite_media_items(db, [])


@pytest.mark.asyncio
async def test_unhide_dialogs_empty_list(db):
    await unhide_dialogs(db, [])


@pytest.mark.asyncio
async def test_mark_media_scanned_empty(db):
    """Empty list should be a no-op."""
    await mark_media_scanned(db, [])


@pytest.mark.asyncio
async def test_get_media_by_id_explicitly_closes_cursor(db):
    """Regression: get_media_by_id must explicitly close its cursor via async with.

    Production failure: db is a singleton shared across all requests. The
    download_media route calls get_media_by_id, then _stream_video (an async
    generator that runs for seconds while streaming) eventually calls db.commit().
    If get_media_by_id leaves a cursor open on the worker thread, SQLite raises
    'cannot commit transaction - SQL statements in progress'.

    We verify the fix by spying on the cursor returned by db.execute:
    the cursor's close() method must be called before get_media_by_id returns.
    """
    from unittest.mock import AsyncMock, patch
    import aiosqlite

    item = make_media_item(message_id=999, chat_id=1, chat_name="G", date="2026-01-01T00:00:00")
    await insert_media_item(db, item)
    await db.commit()

    async with await db.execute("SELECT id FROM media_items WHERE message_id = ?", (999,)) as cur:
        row = await cur.fetchone()
    media_id = row[0]

    close_called = []

    original_execute = db.execute

    async def spying_execute(sql, *args, **kwargs):
        cursor = await original_execute(sql, *args, **kwargs)
        original_close = cursor.close

        async def tracked_close():
            close_called.append(True)
            return await original_close()

        cursor.close = tracked_close
        return cursor

    with patch.object(db, "execute", side_effect=spying_execute):
        result = await get_media_by_id(db, media_id)

    assert result is not None
    assert result["message_id"] == 999
    assert close_called, (
        "get_media_by_id did not call cursor.close() — "
        "this leaves the aiosqlite cursor open in the worker thread, "
        "which can block db.commit() in _stream_video on the shared connection"
    )


# ---------------------------------------------------------------------------
# delete_person tests
# ---------------------------------------------------------------------------

from database import delete_person, get_cross_person_conflicts  # noqa: E402
import numpy as np  # noqa: E402


def _make_embedding():
    return np.random.default_rng(42).standard_normal(512).astype(np.float32).tobytes()


async def _seed_person_with_media(db, media_id=1, face_count=2, name=None):
    """Insert a person with faces linked to a media item. Returns person_id."""
    now = utc_now_iso()
    face_rows = [
        {
            "media_id": media_id,
            "embedding": _make_embedding(),
            "bbox_x": 0.1, "bbox_y": 0.1, "bbox_w": 0.2, "bbox_h": 0.2,
            "confidence": 0.9,
            "crop_path": f"/tmp/face_{media_id}_{i}.jpg",
            "created_at": now,
        }
        for i in range(face_count)
    ]
    face_ids = await insert_faces_batch(db, face_rows)
    clusters = [{"face_ids": face_ids, "representative_face_id": face_ids[0]}]
    await bulk_assign_persons(db, clusters)
    await db.commit()
    cursor = await db.execute("SELECT person_id FROM faces WHERE id = ?", (face_ids[0],))
    row = await cursor.fetchone()
    person_id = row[0]
    if name:
        await db.execute("UPDATE persons SET name = ? WHERE id = ?", (name, person_id))
        await db.commit()
    return person_id


class TestDeletePerson:
    async def test_deletes_person_and_faces(self, db):
        """Person row and all face rows are removed."""
        from helpers import make_media_item
        from database import insert_media_item

        await insert_media_item(db, make_media_item(message_id=1, chat_id=1, chat_name="G"))
        person_id = await _seed_person_with_media(db, media_id=1, face_count=3)

        crop_paths = await delete_person(db, person_id)

        assert await get_person(db, person_id) is None
        cursor = await db.execute("SELECT COUNT(*) FROM faces WHERE person_id = ?", (person_id,))
        assert (await cursor.fetchone())[0] == 0
        assert len(crop_paths) == 3

    async def test_recounts_media_face_count(self, db):
        """media_items.face_count is recounted after faces are deleted."""
        from helpers import make_media_item
        from database import insert_media_item

        await insert_media_item(db, make_media_item(message_id=1, chat_id=1, chat_name="G"))
        p1 = await _seed_person_with_media(db, media_id=1, face_count=2)
        await _seed_person_with_media(db, media_id=1, face_count=1)

        await delete_person(db, p1)

        cursor = await db.execute("SELECT face_count FROM media_items WHERE id = 1")
        row = await cursor.fetchone()
        assert row[0] == 1

    async def test_returns_empty_for_nonexistent(self, db):
        """Deleting a nonexistent person returns empty list."""
        result = await delete_person(db, 99999)
        assert result == []


class TestGetCrossPersonConflicts:
    async def test_finds_other_persons(self, db):
        """Returns other persons that share photos with the given media IDs."""
        from helpers import make_media_item
        from database import insert_media_item

        await insert_media_item(db, make_media_item(message_id=1, chat_id=1, chat_name="G"))
        p1 = await _seed_person_with_media(db, media_id=1, face_count=1, name="Alice")
        p2 = await _seed_person_with_media(db, media_id=1, face_count=1, name="Bob")

        conflicts = await get_cross_person_conflicts(db, [1], exclude_person_id=p1)

        assert len(conflicts) == 1
        assert conflicts[0]["media_id"] == 1
        assert any(p["id"] == p2 for p in conflicts[0]["persons"])
        assert any(p["display_name"] == "Bob" for p in conflicts[0]["persons"])

    async def test_no_conflicts_when_solo(self, db):
        """Returns empty when no other persons share the photos."""
        from helpers import make_media_item
        from database import insert_media_item

        await insert_media_item(db, make_media_item(message_id=1, chat_id=1, chat_name="G"))
        p1 = await _seed_person_with_media(db, media_id=1, face_count=1)

        conflicts = await get_cross_person_conflicts(db, [1], exclude_person_id=p1)

        assert conflicts == []

    async def test_excludes_specified_person(self, db):
        """The excluded person never appears in conflict results."""
        from helpers import make_media_item
        from database import insert_media_item

        await insert_media_item(db, make_media_item(message_id=1, chat_id=1, chat_name="G"))
        p1 = await _seed_person_with_media(db, media_id=1, face_count=1, name="Alice")
        _p2 = await _seed_person_with_media(db, media_id=1, face_count=1, name="Bob")

        conflicts = await get_cross_person_conflicts(db, [1], exclude_person_id=p1)

        for c in conflicts:
            assert all(p["id"] != p1 for p in c["persons"])
