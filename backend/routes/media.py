from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse

from database import get_media_page, get_media_by_id, update_file_ref

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
):
    db = get_db()
    group_ids = [int(g) for g in groups.split(",")] if groups else None
    items = await get_media_page(db, cursor_id=cursor, limit=limit, group_ids=group_ids, media_type=type)
    # Convert file_ref bytes to None for JSON serialization (not needed in list response)
    for item in items:
        if "file_ref" in item and isinstance(item["file_ref"], (bytes, bytearray)):
            del item["file_ref"]
    next_cursor = items[-1]["id"] if len(items) == limit else None
    return {"items": items, "next_cursor": next_cursor}


@router.get("/{media_id}/thumbnail")
async def get_thumbnail(media_id: int):
    db = get_db()
    item = await get_media_by_id(db, media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check local cache
    if item["thumbnail_path"] and Path(item["thumbnail_path"]).exists():
        return FileResponse(item["thumbnail_path"], media_type=item.get("mime_type", "image/jpeg"))

    # Download from Telegram
    tg = get_tg()
    try:
        thumb_bytes = await _download_thumbnail(tg, item)
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch thumbnail from Telegram")

    if thumb_bytes is None:
        raise HTTPException(status_code=404, detail="No thumbnail available")

    # Cache locally
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    thumb_path = CACHE_DIR / f"{media_id}.jpg"
    thumb_path.write_bytes(thumb_bytes)

    # Update DB
    await db.execute("UPDATE media_items SET thumbnail_path = ? WHERE id = ?", (str(thumb_path), media_id))
    await db.commit()

    return FileResponse(str(thumb_path), media_type="image/jpeg")


@router.get("/{media_id}/download")
async def download_media(media_id: int):
    db = get_db()
    item = await get_media_by_id(db, media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")

    tg = get_tg()

    async def stream():
        await tg.acquire_semaphore()
        try:
            async for chunk in tg.client.iter_download(
                await _get_input_location(tg, item),
                chunk_size=512 * 1024,
            ):
                yield chunk
        finally:
            tg.release_semaphore()

    mime = item.get("mime_type", "application/octet-stream")
    return StreamingResponse(stream(), media_type=mime)


async def _download_thumbnail(tg, item: dict) -> bytes | None:
    """Download the smallest photo size or document thumb."""
    from telethon.tl.types import InputPhotoFileLocation, InputDocumentFileLocation
    from telethon.errors import FileReferenceExpiredError

    await tg.acquire_semaphore()
    try:
        try:
            return await tg.client.download_media(
                await _get_input_location(tg, item),
                bytes,
                thumb=-1,  # smallest thumb
            )
        except FileReferenceExpiredError:
            await _refresh_file_ref(tg, item)
            return await tg.client.download_media(
                await _get_input_location(tg, item),
                bytes,
                thumb=-1,
            )
    finally:
        tg.release_semaphore()


async def _get_input_location(tg, item: dict):
    """Get the Telegram input location for downloading."""
    from telethon.tl.types import InputPhotoFileLocation, InputDocumentFileLocation

    if item["media_type"] == "photo":
        return InputPhotoFileLocation(
            id=item["file_id"],
            access_hash=item["access_hash"],
            file_reference=item["file_ref"],
            thumb_size="",
        )
    return InputDocumentFileLocation(
        id=item["file_id"],
        access_hash=item["access_hash"],
        file_reference=item["file_ref"],
        thumb_size="",
    )


async def _refresh_file_ref(tg, item: dict) -> None:
    """Re-fetch the message to get a fresh file reference."""
    db = get_db()
    msg = await tg.client.get_messages(item["chat_id"], ids=item["message_id"])
    if msg and msg.media:
        if msg.photo:
            new_ref = msg.photo.file_reference
        elif msg.document:
            new_ref = msg.document.file_reference
        else:
            return
        item["file_ref"] = new_ref
        await update_file_ref(db, item["id"], new_ref)
