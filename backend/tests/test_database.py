import pytest
import aiosqlite
from database import init_db, insert_media_item, get_media_page, upsert_sync_state, get_sync_state

DB_PATH = ":memory:"


@pytest.fixture
async def db():
    conn = await aiosqlite.connect(DB_PATH)
    await init_db(conn)
    yield conn
    await conn.close()


@pytest.mark.asyncio
async def test_init_db_creates_tables(db):
    cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
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
    }
    await insert_media_item(db, item)
    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1
    assert rows[0]["message_id"] == 100
    assert rows[0]["chat_name"] == "Test Group"


@pytest.mark.asyncio
async def test_cursor_pagination(db):
    for i in range(5):
        await insert_media_item(db, {
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
        })
    page1 = await get_media_page(db, cursor_id=None, limit=3)
    assert len(page1) == 3
    last_id = page1[-1]["id"]
    page2 = await get_media_page(db, cursor_id=last_id, limit=3)
    assert len(page2) == 2


@pytest.mark.asyncio
async def test_filter_by_groups(db):
    for chat_id in [1, 2]:
        await insert_media_item(db, {
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
        })
    rows = await get_media_page(db, cursor_id=None, limit=10, group_ids=[1])
    assert len(rows) == 1
    assert rows[0]["chat_id"] == 1


@pytest.mark.asyncio
async def test_filter_by_media_type(db):
    for mtype in ["photo", "video"]:
        await insert_media_item(db, {
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
        })
    rows = await get_media_page(db, cursor_id=None, limit=10, media_type="video")
    assert len(rows) == 1
    assert rows[0]["media_type"] == "video"


@pytest.mark.asyncio
async def test_sync_state_upsert_and_get(db):
    await upsert_sync_state(db, chat_id=1, chat_name="Test", active=True, last_msg_id=500)
    state = await get_sync_state(db, chat_id=1)
    assert state["active"] == 1
    assert state["last_msg_id"] == 500
    # Update
    await upsert_sync_state(db, chat_id=1, chat_name="Test", active=True, last_msg_id=600)
    state = await get_sync_state(db, chat_id=1)
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
    }
    await insert_media_item(db, item)
    await insert_media_item(db, item)  # should not raise
    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1
