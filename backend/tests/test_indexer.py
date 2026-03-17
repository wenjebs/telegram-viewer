from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telethon.errors import ChannelPrivateError, FloodWaitError
from telethon.tl.types import MessageMediaDocument

from database import get_media_page, get_sync_state
from helpers import AsyncIterator, make_photo_message, make_video_message
from indexer import (
    _best_photo_size,
    _document_dimensions,
    _download_batch_thumbnails,
    _extract_media,
    _fetch_media_counts,
    _sender_name,
    get_new_media_counts,
    index_chat,
)


# ---------------------------------------------------------------------------
# index_chat integration tests
# ---------------------------------------------------------------------------


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
    assert state is not None
    assert state["last_msg_id"] == 2

    # Second sync with no new messages
    client.client.iter_messages = MagicMock(return_value=AsyncIterator([]))
    async for _ in index_chat(client, db, chat_id=1, chat_name="Test"):
        pass

    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1  # no duplicates


@pytest.mark.asyncio
async def test_index_chat_empty_yields_done(db):
    """A chat with zero media should still yield a done event."""
    client = AsyncMock()
    client.client.iter_messages = MagicMock(return_value=AsyncIterator([]))
    client.acquire_semaphore = AsyncMock()
    client.release_semaphore = MagicMock()

    events = []
    async for ev in index_chat(client, db, chat_id=1, chat_name="Test"):
        events.append(ev)

    assert len(events) == 1
    assert events[0].type == "done"


@pytest.mark.asyncio
async def test_index_chat_video_document(db):
    """Video documents should be indexed correctly."""
    client = AsyncMock()
    msg = make_video_message(5, "2026-03-15T10:00:00")
    # MagicMock auto-creates truthy sticker/gif attrs; set to None for _extract_media
    msg.sticker = None
    msg.gif = None
    messages = [msg]
    # iter_messages is called once per filter (Photos, Video, Document).
    # Return empty for Photos/Video, the video msg for Document filter.
    client.client.iter_messages = MagicMock(
        side_effect=[AsyncIterator([]), AsyncIterator([]), AsyncIterator(messages)]
    )
    client.acquire_semaphore = AsyncMock()
    client.release_semaphore = MagicMock()

    # Use precomputed_counts to skip _fetch_media_counts call
    async for _ in index_chat(
        client, db, chat_id=1, chat_name="Test",
        precomputed_counts={"photos": 0, "videos": 1, "documents": 0, "total": 1},
    ):
        pass

    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1
    assert rows[0]["media_type"] == "video"
    assert rows[0]["width"] == 1920


# ---------------------------------------------------------------------------
# _extract_media
# ---------------------------------------------------------------------------


def _make_base_msg(msg_id=1, date_str="2026-03-15T10:00:00"):
    msg = MagicMock()
    msg.id = msg_id
    msg.date = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
    msg.text = ""
    msg.sender = None
    msg.post_author = None
    return msg


def test_extract_media_no_media():
    """Messages without photo or document media return None."""
    msg = _make_base_msg()
    msg.media = None
    msg.photo = None
    msg.document = None
    assert _extract_media(msg, 1, "Test") is None


def test_extract_media_sticker_returns_none():
    """Stickers should be skipped."""
    msg = _make_base_msg()
    msg.media = MagicMock(spec=MessageMediaDocument)
    msg.photo = None
    msg.document = MagicMock()
    msg.document.id = 1
    msg.sticker = True
    msg.gif = None
    msg.file = MagicMock()
    msg.file.mime_type = "image/webp"
    assert _extract_media(msg, 1, "Test") is None


def test_extract_media_gif_returns_none():
    """GIFs should be skipped."""
    msg = _make_base_msg()
    msg.media = MagicMock(spec=MessageMediaDocument)
    msg.photo = None
    msg.document = MagicMock()
    msg.document.id = 1
    msg.sticker = None
    msg.gif = True
    msg.file = MagicMock()
    msg.file.mime_type = "video/mp4"
    assert _extract_media(msg, 1, "Test") is None


def test_extract_media_document_video():
    """video/mp4 document should be extracted as video."""
    msg = _make_base_msg()
    msg.media = MagicMock(spec=MessageMediaDocument)
    msg.photo = None
    msg.document = MagicMock()
    msg.document.id = 100
    msg.document.access_hash = 200
    msg.document.file_reference = b"ref"
    msg.document.attributes = [MagicMock(w=1280, h=720, duration=60)]
    msg.sticker = None
    msg.gif = None
    msg.file = MagicMock()
    msg.file.mime_type = "video/mp4"
    msg.file.size = 999

    result = _extract_media(msg, 1, "Test")
    assert result is not None
    assert result["media_type"] == "video"
    assert result["width"] == 1280
    assert result["height"] == 720
    assert result["duration"] == 60


def test_extract_media_document_image():
    """image/png document should be extracted as photo."""
    msg = _make_base_msg()
    msg.media = MagicMock(spec=MessageMediaDocument)
    msg.photo = None
    msg.document = MagicMock()
    msg.document.id = 100
    msg.document.access_hash = 200
    msg.document.file_reference = b"ref"
    msg.document.attributes = []
    msg.sticker = None
    msg.gif = None
    msg.file = MagicMock()
    msg.file.mime_type = "image/png"
    msg.file.size = 500

    result = _extract_media(msg, 1, "Test")
    assert result is not None
    assert result["media_type"] == "photo"
    assert result["mime_type"] == "image/png"


def test_extract_media_non_media_mime():
    """Documents with non-image/non-video MIME should be skipped."""
    msg = _make_base_msg()
    msg.media = MagicMock(spec=MessageMediaDocument)
    msg.photo = None
    msg.document = MagicMock()
    msg.document.id = 100
    msg.sticker = None
    msg.gif = None
    msg.file = MagicMock()
    msg.file.mime_type = "application/pdf"

    assert _extract_media(msg, 1, "Test") is None


# ---------------------------------------------------------------------------
# _sender_name
# ---------------------------------------------------------------------------


def test_sender_name_first_and_last():
    msg = MagicMock()
    msg.sender = MagicMock(spec=["first_name", "last_name"])
    msg.sender.first_name = "John"
    msg.sender.last_name = "Doe"
    msg.post_author = None
    assert _sender_name(msg) == "John Doe"


def test_sender_name_first_only():
    msg = MagicMock()
    msg.sender = MagicMock(spec=["first_name", "last_name"])
    msg.sender.first_name = "Alice"
    msg.sender.last_name = ""
    msg.post_author = None
    assert _sender_name(msg) == "Alice"


def test_sender_name_title_channel():
    msg = MagicMock()
    # Channel senders have title, not first_name
    msg.sender = MagicMock(spec=["title"])
    msg.sender.title = "My Channel"
    msg.post_author = None
    assert _sender_name(msg) == "My Channel"


def test_sender_name_post_author_fallback():
    msg = MagicMock()
    msg.sender = None
    msg.post_author = "Admin"
    assert _sender_name(msg) == "Admin"


def test_sender_name_none():
    msg = MagicMock()
    msg.sender = None
    msg.post_author = None
    assert _sender_name(msg) is None


# ---------------------------------------------------------------------------
# _best_photo_size
# ---------------------------------------------------------------------------


def test_best_photo_size_picks_largest():
    sizes = [
        MagicMock(w=100, h=100),
        MagicMock(w=320, h=320),
        MagicMock(w=200, h=150),
    ]
    best = _best_photo_size(sizes)
    assert best.w == 320
    assert best.h == 320


def test_best_photo_size_no_candidates():
    """Sizes without w/h attributes should return None."""
    s = MagicMock(spec=[])  # no w or h
    assert _best_photo_size([s]) is None


def test_best_photo_size_single():
    s = MagicMock(w=640, h=480)
    assert _best_photo_size([s]) is s


def test_best_photo_size_empty():
    assert _best_photo_size([]) is None


# ---------------------------------------------------------------------------
# _document_dimensions
# ---------------------------------------------------------------------------


def test_document_dimensions_video():
    doc = MagicMock()
    doc.attributes = [MagicMock(w=1920, h=1080, duration=120)]
    w, h, dur = _document_dimensions(doc)
    assert w == 1920
    assert h == 1080
    assert dur == 120


def test_document_dimensions_no_attributes():
    doc = MagicMock()
    doc.attributes = []
    w, h, dur = _document_dimensions(doc)
    assert w is None
    assert h is None
    assert dur is None


def test_document_dimensions_none_attributes():
    doc = MagicMock()
    doc.attributes = None
    w, h, dur = _document_dimensions(doc)
    assert w is None
    assert h is None
    assert dur is None


def test_document_dimensions_audio_duration_only():
    """Audio attributes may have duration but no w/h."""
    attr = MagicMock(spec=["duration"])
    attr.duration = 240
    doc = MagicMock()
    doc.attributes = [attr]
    w, h, dur = _document_dimensions(doc)
    assert w is None
    assert h is None
    assert dur == 240


# ---------------------------------------------------------------------------
# _download_batch_thumbnails
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_download_batch_thumbnails_success(tmp_path):
    """Successfully downloaded thumbnail bytes are written to disk."""
    tg = AsyncMock()
    tg.acquire_semaphore = AsyncMock()
    tg.release_semaphore = MagicMock()
    tg.client.download_media = AsyncMock(return_value=b"\xff\xd8\xff\xe0fake_jpg")

    item = {"chat_id": 1, "message_id": 10, "thumbnail_path": None}
    mock_msg = MagicMock()

    with patch("indexer.CACHE_DIR", tmp_path):
        await _download_batch_thumbnails(tg, [(item, mock_msg)])

    assert item["thumbnail_path"] is not None
    assert "1_10.jpg" in item["thumbnail_path"]


@pytest.mark.asyncio
async def test_download_batch_thumbnails_error_non_fatal(tmp_path):
    """Download failure should not raise; thumbnail_path stays None."""
    tg = AsyncMock()
    tg.acquire_semaphore = AsyncMock()
    tg.release_semaphore = MagicMock()
    tg.client.download_media = AsyncMock(side_effect=Exception("network error"))

    item = {"chat_id": 1, "message_id": 10, "thumbnail_path": None}
    mock_msg = MagicMock()

    with patch("indexer.CACHE_DIR", tmp_path):
        await _download_batch_thumbnails(tg, [(item, mock_msg)])

    # Should not have set a path since download failed
    assert item["thumbnail_path"] is None


# ---------------------------------------------------------------------------
# _fetch_media_counts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_media_counts_sums():
    """Returns sum of photo, video, document counts."""
    tg = AsyncMock()

    photo_result = MagicMock(total=10)
    video_result = MagicMock(total=5)
    doc_result = MagicMock(total=3)
    tg.client.get_messages = AsyncMock(side_effect=[photo_result, video_result, doc_result])

    result = await _fetch_media_counts(tg, chat_id=1, min_id=0)
    assert result["photos"] == 10
    assert result["videos"] == 5
    assert result["documents"] == 3
    assert result["total"] == 18


@pytest.mark.asyncio
async def test_fetch_media_counts_flood_wait_retries():
    """FloodWaitError should trigger retry via tenacity."""
    tg = AsyncMock()

    photo_result = MagicMock(total=1)
    video_result = MagicMock(total=0)
    doc_result = MagicMock(total=0)

    # First call raises FloodWait, second succeeds
    flood_err = FloodWaitError(request=None, capture=0)
    flood_err.seconds = 0  # keep test fast
    tg.client.get_messages = AsyncMock(
        side_effect=[flood_err, photo_result, video_result, doc_result]
    )

    with patch("asyncio.sleep", new_callable=AsyncMock):
        result = await _fetch_media_counts(tg, chat_id=1)
    assert result["total"] == 1


# ---------------------------------------------------------------------------
# get_new_media_counts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_new_media_counts_inaccessible():
    """Inaccessible chats return None."""
    tg = AsyncMock()
    tg.client.get_messages = AsyncMock(side_effect=ChannelPrivateError(request=None))

    result = await get_new_media_counts(tg, chat_id=1)
    assert result is None


@pytest.mark.asyncio
async def test_get_new_media_counts_success():
    """Normal case returns count dict."""
    tg = AsyncMock()
    photo_result = MagicMock(total=2)
    video_result = MagicMock(total=1)
    doc_result = MagicMock(total=0)
    tg.client.get_messages = AsyncMock(side_effect=[photo_result, video_result, doc_result])

    result = await get_new_media_counts(tg, chat_id=1, min_id=0)
    assert result is not None
    assert result["total"] == 3
