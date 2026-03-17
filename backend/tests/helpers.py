"""Shared test helpers: factories, async iterators, and utility functions."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

from telethon.tl.types import MessageMediaDocument, MessageMediaPhoto


def make_media_item(**overrides) -> dict:
    """Return a media-item dict with sensible defaults; keyword args override any field."""
    defaults = {
        "message_id": 1,
        "chat_id": 1,
        "chat_name": "TestGroup",
        "date": "2026-03-15T10:00:00",
        "media_type": "photo",
        "mime_type": "image/jpeg",
        "file_size": 50000,
        "width": 800,
        "height": 600,
        "duration": None,
        "caption": None,
        "file_id": 10,
        "access_hash": 100,
        "file_ref": b"ref",
        "thumbnail_path": None,
        "sender_name": None,
    }
    defaults.update(overrides)
    return defaults


def make_photo_message(msg_id: int, date: str) -> MagicMock:
    """Create a mock Telethon message with a photo attachment."""
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
    msg.sender = None
    msg.post_author = None
    return msg


def make_video_message(msg_id: int, date: str) -> MagicMock:
    """Create a mock Telethon message with a video attachment."""
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
    msg.sender = None
    msg.post_author = None
    return msg


class AsyncIterator:
    """Helper to make a list behave as an async iterator (for mocking Telethon iter_messages)."""

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
