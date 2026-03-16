from __future__ import annotations

import asyncio
import logging
import mimetypes
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from database import get_media_page, get_media_by_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/media", tags=["media"])

_db = None
_tg = None
CACHE_DIR = Path(__file__).parent.parent / "cache"


def set_db(db):
    global _db
    _db = db


def get_db():
    return _db


def set_tg(tg):
    global _tg
    _tg = tg


def get_tg():
    return _tg


@router.get("")
async def list_media(
    cursor: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    groups: str | None = Query(None),
    type: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
):
    db = get_db()
    group_ids = [int(g) for g in groups.split(",")] if groups else None
    items = await get_media_page(
        db,
        cursor_id=cursor,
        limit=limit,
        group_ids=group_ids,
        media_type=type,
        date_from=date_from,
        date_to=date_to,
    )
    for item in items:
        # Normalize legacy space-separated dates to ISO 8601
        if " " in item["date"]:
            item["date"] = item["date"].replace(" ", "T", 1)
        # Remove file_ref from list response (bytes/memoryview not JSON-serializable)
        item.pop("file_ref", None)
    next_cursor = items[-1]["id"] if len(items) == limit else None
    return {"items": items, "next_cursor": next_cursor}


@router.get("/{media_id}/thumbnail")
async def get_thumbnail(media_id: int):
    db = get_db()
    item = await get_media_by_id(db, media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")

    cache_headers = {"Cache-Control": "public, max-age=86400, immutable"}

    # Check local cache
    if item["thumbnail_path"] and Path(item["thumbnail_path"]).exists():
        return FileResponse(
            item["thumbnail_path"],
            media_type=item.get("mime_type", "image/jpeg"),
            headers=cache_headers,
        )

    # Download from Telegram
    tg = get_tg()
    try:
        thumb_bytes = await _download_thumbnail(tg, item)
    except Exception:
        raise HTTPException(
            status_code=502, detail="Failed to fetch thumbnail from Telegram"
        )

    if thumb_bytes is None:
        raise HTTPException(status_code=404, detail="No thumbnail available")

    # Cache locally
    await asyncio.to_thread(CACHE_DIR.mkdir, parents=True, exist_ok=True)
    thumb_path = CACHE_DIR / f"{media_id}.jpg"
    await asyncio.to_thread(thumb_path.write_bytes, thumb_bytes)

    # Update DB
    await db.execute(
        "UPDATE media_items SET thumbnail_path = ? WHERE id = ?",
        (str(thumb_path), media_id),
    )
    await db.commit()

    return FileResponse(str(thumb_path), media_type="image/jpeg", headers=cache_headers)


@router.get("/{media_id}/download")
async def download_media(media_id: int):
    db = get_db()
    item = await get_media_by_id(db, media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")

    mime = item.get("mime_type", "application/octet-stream")
    cache_headers = {"Cache-Control": "public, max-age=86400, immutable"}

    # Check local cache
    if item.get("download_path") and Path(item["download_path"]).exists():
        return FileResponse(
            item["download_path"], media_type=mime, headers=cache_headers
        )

    tg = get_tg()
    try:
        data = await _download_full(tg, item)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error downloading media %s", media_id)
        raise HTTPException(
            status_code=502, detail="Failed to download media from Telegram"
        )

    # Cache locally
    await asyncio.to_thread(CACHE_DIR.mkdir, parents=True, exist_ok=True)
    ext = mimetypes.guess_extension(mime) or ""
    download_path = CACHE_DIR / f"{media_id}_full{ext}"
    await asyncio.to_thread(download_path.write_bytes, data)

    await db.execute(
        "UPDATE media_items SET download_path = ? WHERE id = ?",
        (str(download_path), media_id),
    )
    await db.commit()

    return FileResponse(str(download_path), media_type=mime, headers=cache_headers)


async def _download_full(tg, item: dict) -> bytes:
    """Download full media file via Telethon's download_media (handles file refs internally)."""
    await tg.acquire_semaphore()
    try:
        msg = await tg.client.get_messages(item["chat_id"], ids=item["message_id"])
        if not msg or not msg.media:
            raise HTTPException(
                status_code=404, detail="Media no longer available on Telegram"
            )
        data = await tg.client.download_media(msg, bytes)
        if data is None:
            raise HTTPException(
                status_code=502, detail="Telegram returned no data for media"
            )
        return data
    finally:
        tg.release_semaphore()


async def _download_thumbnail(tg, item: dict) -> bytes | None:
    """Download the smallest photo size or document thumb."""
    await tg.acquire_semaphore()
    try:
        msg = await tg.client.get_messages(item["chat_id"], ids=item["message_id"])
        if not msg or not msg.media:
            return None
        return await tg.client.download_media(msg, bytes, thumb=-1)
    finally:
        tg.release_semaphore()
