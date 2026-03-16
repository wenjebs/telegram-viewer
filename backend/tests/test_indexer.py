import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
import aiosqlite
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
from database import init_db, get_media_page, get_sync_state
from indexer import index_chat


def make_photo_message(msg_id: int, date: str):
    msg = MagicMock()
    msg.id = msg_id
    msg.date = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
    msg.text = "caption"
    msg.media = MagicMock(spec=MessageMediaPhoto)
    msg.photo = MagicMock()
    msg.photo.id = msg_id * 10
    msg.photo.access_hash = msg_id * 100
    msg.photo.file_reference = b"ref"
    msg.photo.sizes = [
        MagicMock(type="s", w=100, h=100),
        MagicMock(type="m", w=320, h=320),
    ]
    msg.document = None
    msg.file = MagicMock()
    msg.file.mime_type = "image/jpeg"
    msg.file.size = 50000
    return msg


def make_video_message(msg_id: int, date: str):
    msg = MagicMock()
    msg.id = msg_id
    msg.date = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
    msg.text = ""
    msg.media = MagicMock(spec=MessageMediaDocument)
    msg.photo = None
    msg.document = MagicMock()
    msg.document.id = msg_id * 10
    msg.document.access_hash = msg_id * 100
    msg.document.file_reference = b"ref"
    msg.document.thumbs = [MagicMock()]
    msg.document.attributes = [MagicMock(w=1920, h=1080, duration=30)]
    msg.file = MagicMock()
    msg.file.mime_type = "video/mp4"
    msg.file.size = 5000000
    return msg


@pytest.fixture
async def db():
    conn = await aiosqlite.connect(":memory:")
    await init_db(conn)
    yield conn
    await conn.close()


@pytest.mark.asyncio
async def test_index_chat_photos(db):
    client = AsyncMock()
    messages = [make_photo_message(1, "2026-03-15T10:00:00")]
    client.client.iter_messages = MagicMock(return_value=AsyncIterator(messages))
    client.acquire_semaphore = AsyncMock()
    client.release_semaphore = MagicMock()

    async for _ in index_chat(client, db, chat_id=1, chat_name="Test"):
        pass

    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1
    assert rows[0]["media_type"] == "photo"
    assert rows[0]["width"] == 320  # uses largest PhotoSize


@pytest.mark.asyncio
async def test_index_chat_incremental(db):
    """Second sync should only fetch new messages."""
    client = AsyncMock()
    messages = [make_photo_message(2, "2026-03-16T10:00:00")]
    client.client.iter_messages = MagicMock(return_value=AsyncIterator(messages))
    client.acquire_semaphore = AsyncMock()
    client.release_semaphore = MagicMock()

    # First sync
    async for _ in index_chat(client, db, chat_id=1, chat_name="Test"):
        pass

    # Check sync state was saved
    state = await get_sync_state(db, chat_id=1)
    assert state["last_msg_id"] == 2

    # Second sync with no new messages
    client.client.iter_messages = MagicMock(return_value=AsyncIterator([]))
    async for _ in index_chat(client, db, chat_id=1, chat_name="Test"):
        pass

    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1  # no duplicates


class AsyncIterator:
    """Helper to make a list behave as an async iterator."""

    def __init__(self, items):
        self._items = items
        self._total = MagicMock(return_value=len(items))

    def __aiter__(self):
        self._iter = iter(self._items)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration
