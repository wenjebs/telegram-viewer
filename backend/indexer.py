from __future__ import annotations

from typing import AsyncGenerator
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
from telegram_client import TelegramClientWrapper
import aiosqlite
from database import insert_media_item, upsert_sync_state, get_sync_state


async def index_chat(
    tg: TelegramClientWrapper,
    db: aiosqlite.Connection,
    chat_id: int,
    chat_name: str,
) -> AsyncGenerator[tuple[int, int], None]:
    """Index media from a chat. Yields (progress, total) tuples."""
    state = await get_sync_state(db, chat_id)
    min_id = state["last_msg_id"] if state else 0

    # Collect messages with media
    messages = []
    async for msg in tg.client.iter_messages(chat_id, min_id=min_id):
        if msg.media and isinstance(msg.media, (MessageMediaPhoto, MessageMediaDocument)):
            item = _extract_media(msg, chat_id, chat_name)
            if item:
                messages.append((msg, item))

    total = len(messages)
    if total == 0:
        yield (0, 0)
        return

    max_msg_id = min_id
    for i, (msg, item) in enumerate(messages):
        await insert_media_item(db, item)
        max_msg_id = max(max_msg_id, msg.id)
        yield (i + 1, total)

    await upsert_sync_state(db, chat_id=chat_id, chat_name=chat_name, active=True, last_msg_id=max_msg_id)


def _extract_media(msg, chat_id: int, chat_name: str) -> dict | None:
    """Extract media metadata from a Telegram message."""
    if isinstance(msg.media, MessageMediaPhoto) and msg.photo:
        sizes = msg.photo.sizes if msg.photo.sizes else []
        # Pick largest non-stripped size for dimensions
        best = _best_photo_size(sizes)
        w = getattr(best, "w", None) if best else None
        h = getattr(best, "h", None) if best else None
        return {
            "message_id": msg.id,
            "chat_id": chat_id,
            "chat_name": chat_name,
            "date": str(msg.date),
            "media_type": "photo",
            "mime_type": getattr(msg.file, "mime_type", "image/jpeg") if msg.file else "image/jpeg",
            "file_size": getattr(msg.file, "size", None) if msg.file else None,
            "width": w,
            "height": h,
            "duration": None,
            "caption": msg.text or None,
            "file_id": msg.photo.id,
            "access_hash": msg.photo.access_hash,
            "file_ref": msg.photo.file_reference,
            "thumbnail_path": None,
        }

    if isinstance(msg.media, MessageMediaDocument) and msg.document:
        mime = getattr(msg.file, "mime_type", "") if msg.file else ""
        if not (mime.startswith("image/") or mime.startswith("video/")):
            return None

        media_type = "video" if mime.startswith("video/") else "photo"
        w, h, duration = _document_dimensions(msg.document)

        return {
            "message_id": msg.id,
            "chat_id": chat_id,
            "chat_name": chat_name,
            "date": str(msg.date),
            "media_type": media_type,
            "mime_type": mime,
            "file_size": getattr(msg.file, "size", None) if msg.file else None,
            "width": w,
            "height": h,
            "duration": duration,
            "caption": msg.text or None,
            "file_id": msg.document.id,
            "access_hash": msg.document.access_hash,
            "file_ref": msg.document.file_reference,
            "thumbnail_path": None,
        }

    return None


def _best_photo_size(sizes) -> object | None:
    """Pick the largest PhotoSize that has width/height."""
    candidates = [s for s in sizes if hasattr(s, "w") and hasattr(s, "h")]
    if not candidates:
        return None
    return max(candidates, key=lambda s: s.w * s.h)


def _document_dimensions(doc) -> tuple[int | None, int | None, float | None]:
    """Extract w, h, duration from document attributes."""
    w = h = None
    duration = None
    for attr in (doc.attributes or []):
        if hasattr(attr, "w") and hasattr(attr, "h"):
            w = attr.w
            h = attr.h
        if hasattr(attr, "duration"):
            duration = attr.duration
    return w, h, duration
