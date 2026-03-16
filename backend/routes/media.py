from __future__ import annotations

import asyncio
import logging
import mimetypes
import os
import tempfile
import time
import uuid
import zipfile
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask
from starlette.responses import StreamingResponse

from database import (
    get_media_page,
    get_media_by_id,
    get_media_by_ids,
    hide_media_item,
    hide_media_items,
    unhide_media_items,
    get_hidden_media_page,
    get_hidden_count,
    favorite_media_item,
    favorite_media_items,
    unfavorite_media_item,
    get_favorites_media_page,
    get_favorites_count,
)
from deps import get_db, get_tg, get_zip_jobs, get_background_tasks
from utils import fire_and_forget

if TYPE_CHECKING:
    import aiosqlite

    from telegram_client import TelegramClientWrapper

from telethon.tl.custom import Message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/media", tags=["media"])

CACHE_DIR = Path(__file__).parent.parent / "cache"


# region Helpers
def _parse_cursor(cursor: str | None) -> tuple[int | None, str | None]:
    """Parse a cursor string into (cursor_id, cursor_value).

    Supports composite cursors ("value|id") and plain id cursors ("123").
    Raises HTTPException 400 on malformed input.
    """
    if cursor is None:
        return None, None
    try:
        if "|" in cursor:
            value, cid = cursor.rsplit("|", 1)
            return int(cid), value
        return int(cursor), None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cursor")


def _build_media_response(
    items: list[dict],
    limit: int,
    *,
    cursor_column: str = "date",
) -> dict:
    """Normalize dates, strip non-serializable fields, and compute next_cursor."""
    for item in items:
        if " " in item["date"]:
            item["date"] = item["date"].replace(" ", "T", 1)
        item.pop("file_ref", None)
    if not items or len(items) < limit:
        next_cursor = None
    else:
        last = items[-1]
        next_cursor = f"{last[cursor_column]}|{last['id']}"
    return {"items": items, "next_cursor": next_cursor}


# endregion


# region List / Download zip
@router.get("")
async def list_media(
    db: aiosqlite.Connection = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    groups: str | None = Query(None),
    type: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
):
    cursor_id, cursor_value = _parse_cursor(cursor)
    group_ids = [int(g) for g in groups.split(",")] if groups else None
    items = await get_media_page(
        db,
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        limit=limit,
        group_ids=group_ids,
        media_type=type,
        date_from=date_from,
        date_to=date_to,
    )
    return _build_media_response(items, limit, cursor_column="date")


class DownloadZipRequest(BaseModel):
    media_ids: list[int]


# -- Shared helpers for zip downloads --

_STORED_PREFIXES = ("video/", "image/", "audio/")


async def _ensure_cached(tg: TelegramClientWrapper, item: dict) -> str:
    """Download media to cache dir if not already cached. Returns local path."""
    if item.get("download_path") and Path(item["download_path"]).exists():
        return item["download_path"]

    data = await _download_full(tg, item)
    mime = item.get("mime_type", "application/octet-stream")
    ext = mimetypes.guess_extension(mime) or ""
    download_path = CACHE_DIR / f"{item['id']}_full{ext}"
    await asyncio.to_thread(download_path.write_bytes, data)
    return str(download_path)


def _build_zip(tmp_path: str, items: list[dict], paths: list[str]) -> None:
    """Build a zip archive from items and their local paths."""
    with zipfile.ZipFile(tmp_path, "w") as zf:
        for item, local_path in zip(items, paths):
            mime = item.get("mime_type", "application/octet-stream")
            ext = mimetypes.guess_extension(mime) or ""
            date_str = item["date"][:10] if item.get("date") else "unknown"
            arcname = f"{item['chat_name']}/{date_str}_{item['message_id']}{ext}"
            compress = (
                zipfile.ZIP_STORED
                if any(mime.startswith(p) for p in _STORED_PREFIXES)
                else zipfile.ZIP_DEFLATED
            )
            zf.write(local_path, arcname, compress_type=compress)


def _validate_zip_request(unique_ids: list[int], items: list[dict]) -> None:
    """Shared validation for zip endpoints."""
    if len(unique_ids) > 200:
        raise HTTPException(status_code=400, detail="Maximum 200 items per zip")
    if not unique_ids:
        raise HTTPException(status_code=400, detail="No media IDs provided")
    if len(items) != len(unique_ids):
        found_ids = {item["id"] for item in items}
        missing = [mid for mid in unique_ids if mid not in found_ids]
        raise HTTPException(status_code=404, detail=f"Media not found: {missing}")


@router.post("/download-zip")
async def download_zip(
    body: DownloadZipRequest,
    db: aiosqlite.Connection = Depends(get_db),
    tg: TelegramClientWrapper = Depends(get_tg),
):
    unique_ids = list(set(body.media_ids))
    items = await get_media_by_ids(db, unique_ids)
    _validate_zip_request(unique_ids, items)

    await asyncio.to_thread(CACHE_DIR.mkdir, parents=True, exist_ok=True)

    async def _cache_and_persist(item: dict) -> str:
        path = await _ensure_cached(tg, item)
        if not item.get("download_path"):
            await db.execute(
                "UPDATE media_items SET download_path = ? WHERE id = ?",
                (path, item["id"]),
            )
            await db.commit()
        return path

    paths = await asyncio.gather(*(_cache_and_persist(item) for item in items))

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".zip")
    os.close(tmp_fd)
    await asyncio.to_thread(_build_zip, tmp_path, items, list(paths))

    return FileResponse(
        tmp_path,
        media_type="application/zip",
        filename="telegram_media.zip",
        background=BackgroundTask(os.unlink, tmp_path),
    )


# -- Async zip with progress --

_ZIP_JOB_TTL = 1800  # 30 minutes


async def _cleanup_stale_jobs(zip_jobs: dict[str, dict]) -> None:
    """Remove zip jobs older than TTL and delete their files."""
    now = time.monotonic()
    stale = [
        jid for jid, job in zip_jobs.items() if now - job["created_at"] > _ZIP_JOB_TTL
    ]
    for jid in stale:
        zip_path = zip_jobs[jid].get("zip_path")
        if zip_path:
            await asyncio.to_thread(Path(zip_path).unlink, missing_ok=True)
        del zip_jobs[jid]


async def _cleanup_job(zip_jobs: dict[str, dict], job_id: str) -> None:
    """Clean up a completed zip job after download."""
    job = zip_jobs.pop(job_id, None)
    if job and job.get("zip_path"):
        await asyncio.to_thread(Path(job["zip_path"]).unlink, missing_ok=True)


async def _prepare_zip_job(
    tg: TelegramClientWrapper,
    db: aiosqlite.Connection,
    zip_jobs: dict[str, dict],
    job_id: str,
    items: list[dict],
) -> None:
    """Background task: download files, build zip, update job status."""
    job = zip_jobs[job_id]
    try:
        await asyncio.to_thread(CACHE_DIR.mkdir, parents=True, exist_ok=True)

        async def _cache_one(item: dict) -> tuple[dict, str] | None:
            try:
                path = await _ensure_cached(tg, item)
                return (item, path)
            except Exception:
                logger.warning("Failed to cache item %s", item["id"])
                return None
            finally:
                job["files_ready"] += 1

        results = await asyncio.gather(*(_cache_one(item) for item in items))
        successful = [r for r in results if r is not None]

        # Batch DB update for newly-cached paths
        pairs = [
            (path, item["id"])
            for item, path in successful
            if not item.get("download_path")
        ]
        if pairs:
            await db.executemany(
                "UPDATE media_items SET download_path = ? WHERE id = ?", pairs
            )
            await db.commit()

        skipped = len(items) - len(successful)
        if skipped:
            job["error"] = f"{skipped} file(s) failed to download"

        if not successful:
            job["status"] = "error"
            job["error"] = job.get("error") or "All downloads failed"
            return

        # Build zip
        job["status"] = "zipping"
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".zip")
        os.close(tmp_fd)

        try:
            zip_items = [item for item, _ in successful]
            zip_paths = [path for _, path in successful]
            await asyncio.to_thread(_build_zip, tmp_path, zip_items, zip_paths)
        except Exception:
            Path(tmp_path).unlink(missing_ok=True)
            raise

        job["zip_path"] = tmp_path
        job["status"] = "done"

    except Exception as exc:
        logger.exception("Zip job %s failed", job_id)
        job["status"] = "error"
        job["error"] = str(exc)


@router.post("/prepare-zip")
async def prepare_zip(
    body: DownloadZipRequest,
    db: aiosqlite.Connection = Depends(get_db),
    tg: TelegramClientWrapper = Depends(get_tg),
    zip_jobs: dict[str, dict] = Depends(get_zip_jobs),
    bg_tasks: set[asyncio.Task] = Depends(get_background_tasks),
) -> JSONResponse:
    unique_ids = list(set(body.media_ids))
    items = await get_media_by_ids(db, unique_ids)
    _validate_zip_request(unique_ids, items)

    await _cleanup_stale_jobs(zip_jobs)

    job_id = uuid.uuid4().hex
    zip_jobs[job_id] = {
        "status": "preparing",
        "files_ready": 0,
        "files_total": len(unique_ids),
        "error": None,
        "zip_path": None,
        "created_at": time.monotonic(),
    }

    fire_and_forget(_prepare_zip_job(tg, db, zip_jobs, job_id, items), bg_tasks)
    return JSONResponse(status_code=202, content={"job_id": job_id})


@router.get("/zip-status/{job_id}")
async def zip_status(
    job_id: str,
    zip_jobs: dict[str, dict] = Depends(get_zip_jobs),
) -> dict:
    job = zip_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "status": job["status"],
        "files_ready": job["files_ready"],
        "files_total": job["files_total"],
        "error": job["error"],
    }


@router.get("/zip-download/{job_id}")
async def zip_download(
    job_id: str,
    zip_jobs: dict[str, dict] = Depends(get_zip_jobs),
) -> FileResponse:
    job = zip_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail="Zip not ready")
    return FileResponse(
        job["zip_path"],
        media_type="application/zip",
        filename="telegram_media.zip",
        background=BackgroundTask(_cleanup_job, zip_jobs, job_id),
    )


# endregion


# region Hidden / Favorites (static routes MUST come before /{media_id})
class BatchIdsRequest(BaseModel):
    media_ids: list[int]

    @property
    def validated_ids(self) -> list[int]:
        if not self.media_ids:
            raise HTTPException(status_code=400, detail="No media IDs provided")
        return self.media_ids


UnhideBatchRequest = BatchIdsRequest


@router.get("/hidden")
async def list_hidden_media(
    db: aiosqlite.Connection = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    cursor_id, cursor_value = _parse_cursor(cursor)
    items = await get_hidden_media_page(
        db,
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        limit=limit,
    )
    return _build_media_response(items, limit, cursor_column="hidden_at")


@router.get("/hidden/count")
async def hidden_media_count(db: aiosqlite.Connection = Depends(get_db)):
    count = await get_hidden_count(db)
    return {"count": count}


@router.post("/unhide-batch")
async def unhide_media_batch(
    body: UnhideBatchRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await unhide_media_items(db, body.validated_ids)
    return {"success": True}


@router.post("/hide-batch")
async def hide_media_batch(
    body: BatchIdsRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await hide_media_items(db, body.validated_ids)
    return {"success": True}


@router.post("/favorite-batch")
async def favorite_media_batch(
    body: BatchIdsRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await favorite_media_items(db, body.validated_ids)
    return {"success": True}


@router.get("/favorites")
async def list_favorites_media(
    db: aiosqlite.Connection = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    cursor_id, cursor_value = _parse_cursor(cursor)
    items = await get_favorites_media_page(
        db,
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        limit=limit,
    )
    return _build_media_response(items, limit, cursor_column="favorited_at")


@router.get("/favorites/count")
async def favorites_media_count(db: aiosqlite.Connection = Depends(get_db)):
    count = await get_favorites_count(db)
    return {"count": count}


@router.post("/{media_id}/favorite")
async def favorite_media(
    media_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    item = await get_media_by_id(db, media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")
    if item.get("favorited_at"):
        await unfavorite_media_item(db, media_id)
    else:
        await favorite_media_item(db, media_id)
    return {"success": True, "favorited": not item.get("favorited_at")}


@router.post("/{media_id}/hide")
async def hide_media(
    media_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    item = await get_media_by_id(db, media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")
    await hide_media_item(db, media_id)
    return {"success": True}


@router.post("/{media_id}/unhide")
async def unhide_media(
    media_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    item = await get_media_by_id(db, media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")
    await unhide_media_items(db, [media_id])
    return {"success": True}


# endregion


# region Thumbnail / Download / Telegram helpers
@router.get("/{media_id}/thumbnail")
async def get_thumbnail(
    media_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    tg: TelegramClientWrapper = Depends(get_tg),
):
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
async def download_media(
    media_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    tg: TelegramClientWrapper = Depends(get_tg),
):
    item = await get_media_by_id(db, media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")

    mime = item.get("mime_type", "application/octet-stream")
    cache_headers = {"Cache-Control": "public, max-age=86400, immutable"}

    # Check local cache — serves all media types with range request support
    if item.get("download_path") and Path(item["download_path"]).exists():
        return FileResponse(
            item["download_path"], media_type=mime, headers=cache_headers
        )

    # Non-video: buffer fully, cache, return FileResponse (range request support)
    if item.get("media_type") != "video":
        try:
            data = await _download_full(tg, item)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Unexpected error downloading media %s", media_id)
            raise HTTPException(
                status_code=502, detail="Failed to download media from Telegram"
            )

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

    # Video: stream from Telegram so browser can start playback immediately
    await asyncio.to_thread(CACHE_DIR.mkdir, parents=True, exist_ok=True)
    ext = mimetypes.guess_extension(mime) or ""

    async def _stream_video():
        tmp_path = CACHE_DIR / f"{media_id}_full_{uuid.uuid4().hex[:8]}.tmp"
        await tg.acquire_semaphore()
        try:
            raw = await tg.client.get_messages(item["chat_id"], ids=item["message_id"])
            msg = raw if isinstance(raw, Message) else None
            if not msg or not msg.media:
                raise HTTPException(
                    status_code=404,
                    detail="Media no longer available on Telegram",
                )

            f = open(tmp_path, "wb")
            try:
                async for chunk in tg.client.iter_download(
                    msg.media, chunk_size=256 * 1024
                ):
                    f.write(chunk)
                    yield chunk
            except BaseException:
                f.close()
                tmp_path.unlink(missing_ok=True)
                raise
            else:
                f.close()
                final_path = CACHE_DIR / f"{media_id}_full{ext}"
                tmp_path.rename(final_path)
                await db.execute(
                    "UPDATE media_items SET download_path = ? WHERE id = ?",
                    (str(final_path), media_id),
                )
                await db.commit()
        finally:
            tg.release_semaphore()

    headers = dict(cache_headers)
    if item.get("file_size"):
        headers["Content-Length"] = str(item["file_size"])
    return StreamingResponse(_stream_video(), media_type=mime, headers=headers)


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
