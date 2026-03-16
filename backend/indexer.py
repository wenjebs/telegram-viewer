from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncGenerator

import aiosqlite
from telethon.errors import FloodWaitError
from telethon.tl.types import (
    InputMessagesFilterPhotos,
    InputMessagesFilterVideo,
    MessageMediaDocument,
    MessageMediaPhoto,
)

from database import (
    get_sync_state,
    insert_media_batch,
    update_sync_progress,
    upsert_sync_state,
)
from telegram_client import TelegramClientWrapper

logger = logging.getLogger(__name__)

BATCH_SIZE = 100
CHECKPOINT_INTERVAL = 500
CACHE_DIR = Path(__file__).parent / "cache"


@dataclass
class SyncEvent:
    type: str  # "progress" | "done" | "error" | "flood_wait"
    progress: int = 0
    total: int = 0
    message: str = ""


async def index_chat(
    tg: TelegramClientWrapper,
    db: aiosqlite.Connection,
    chat_id: int,
    chat_name: str,
) -> AsyncGenerator[SyncEvent, None]:
    """Index media from a chat using server-side filters. Yields SyncEvents."""
    state = await get_sync_state(db, chat_id)
    min_id = state["last_msg_id"] if state else 0

    # Get estimated totals upfront (single API call per filter, no messages fetched)
    photo_total = (
        await tg.client.get_messages(
            chat_id, filter=InputMessagesFilterPhotos(), limit=0
        )
    ).total
    video_total = (
        await tg.client.get_messages(
            chat_id, filter=InputMessagesFilterVideo(), limit=0
        )
    ).total
    total = photo_total + video_total

    if total == 0:
        yield SyncEvent(type="done")
        return

    # Ensure sync_state row exists so checkpointing UPDATE works
    await upsert_sync_state(
        db, chat_id=chat_id, chat_name=chat_name, active=True, last_msg_id=min_id
    )

    progress = 0
    max_msg_id = min_id
    batch: list[tuple[dict, object]] = []  # (item_dict, telegram_msg)

    filters = [InputMessagesFilterPhotos(), InputMessagesFilterVideo()]

    for filt in filters:
        current_min_id = min_id
        while True:
            try:
                async for msg in tg.client.iter_messages(
                    chat_id, min_id=current_min_id, filter=filt
                ):
                    item = _extract_media(msg, chat_id, chat_name)
                    if item:
                        batch.append((item, msg))
                        max_msg_id = max(max_msg_id, msg.id)
                        progress += 1

                        if len(batch) >= BATCH_SIZE:
                            await _download_batch_thumbnails(tg, batch)
                            await insert_media_batch(db, [it for it, _ in batch])
                            batch = []

                        if progress % 10 == 0:
                            yield SyncEvent(
                                type="progress",
                                progress=progress,
                                total=total,
                            )

                        if progress % CHECKPOINT_INTERVAL == 0:
                            await update_sync_progress(db, chat_id, max_msg_id)
                break  # iteration completed normally
            except FloodWaitError as e:
                yield SyncEvent(
                    type="flood_wait",
                    progress=progress,
                    total=total,
                    message=f"Flood wait: sleeping {e.seconds}s",
                )
                await asyncio.sleep(e.seconds + 1)
                current_min_id = max_msg_id
                continue

    # Flush remaining batch
    if batch:
        await _download_batch_thumbnails(tg, batch)
        await insert_media_batch(db, [it for it, _ in batch])

    # Final sync state update
    await upsert_sync_state(
        db, chat_id=chat_id, chat_name=chat_name, active=True, last_msg_id=max_msg_id
    )

    yield SyncEvent(type="done", progress=progress, total=total)


def _extract_media(msg, chat_id: int, chat_name: str) -> dict | None:
    """Extract media metadata from a Telegram message."""
    if isinstance(msg.media, MessageMediaPhoto) and msg.photo:
        sizes = msg.photo.sizes if msg.photo.sizes else []
        best = _best_photo_size(sizes)
        w = getattr(best, "w", None) if best else None
        h = getattr(best, "h", None) if best else None
        return {
            "message_id": msg.id,
            "chat_id": chat_id,
            "chat_name": chat_name,
            "date": msg.date.isoformat(),
            "media_type": "photo",
            "mime_type": getattr(msg.file, "mime_type", "image/jpeg")
            if msg.file
            else "image/jpeg",
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
        if msg.sticker or msg.gif:
            return None
        mime = getattr(msg.file, "mime_type", "") if msg.file else ""
        if not (mime.startswith("image/") or mime.startswith("video/")):
            return None

        media_type = "video" if mime.startswith("video/") else "photo"
        w, h, duration = _document_dimensions(msg.document)

        return {
            "message_id": msg.id,
            "chat_id": chat_id,
            "chat_name": chat_name,
            "date": msg.date.isoformat(),
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
    for attr in doc.attributes or []:
        if hasattr(attr, "w") and hasattr(attr, "h"):
            w = attr.w
            h = attr.h
        if hasattr(attr, "duration"):
            duration = attr.duration
    return w, h, duration


async def _download_batch_thumbnails(
    tg: TelegramClientWrapper, batch: list[tuple[dict, object]]
) -> None:
    """Download thumbnails for a batch of items concurrently. Non-fatal on errors."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    async def _download_one(item: dict, msg: object) -> None:
        chat_id = item["chat_id"]
        message_id = item["message_id"]
        thumb_path = CACHE_DIR / f"{chat_id}_{message_id}.jpg"
        if thumb_path.exists():
            item["thumbnail_path"] = str(thumb_path)
            return
        await tg.acquire_semaphore()
        try:
            thumb_bytes = await tg.client.download_media(msg, bytes, thumb=-1)
            if thumb_bytes:
                thumb_path.write_bytes(thumb_bytes)
                item["thumbnail_path"] = str(thumb_path)
        except Exception:
            logger.debug(
                "Failed to download thumbnail for msg %s in chat %s",
                message_id,
                chat_id,
            )
        finally:
            tg.release_semaphore()

    await asyncio.gather(*[_download_one(item, msg) for item, msg in batch])
