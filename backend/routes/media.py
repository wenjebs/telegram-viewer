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
from typing import TYPE_CHECKING, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, field_validator
from starlette.background import BackgroundTask
from starlette.responses import StreamingResponse

from database import (
    get_media_page,
    get_media_by_id,
    get_media_by_ids,
    get_media_count,
    get_media_ids,
    hide_media_item,
    hide_media_items,
    unhide_media_items,
    get_hidden_media_page,
    get_hidden_count,
    get_hidden_media_ids,
    favorite_media_item,
    favorite_media_items,
    unfavorite_media_item,
    unfavorite_media_items,
    get_favorites_media_page,
    get_favorites_count,
    get_favorites_media_ids,
)
from deps import get_db, get_tg, get_zip_jobs, get_background_tasks
from utils import fire_and_forget, parse_cursor, build_media_response

if TYPE_CHECKING:
    import aiosqlite

    from telegram_client import TelegramClientWrapper

from telethon.tl.custom import Message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/media", tags=["media"])

CACHE_DIR = Path(os.getenv("CACHE_DIR", str(Path(__file__).parent.parent / "cache")))

_download_registry: dict[int, asyncio.Future[str]] = {}


def _resolve_future(fut: asyncio.Future, task: asyncio.Task) -> None:
    if fut.done():
        return
    if task.cancelled():
        fut.cancel()
    elif exc := task.exception():
        fut.set_exception(exc)
    else:
        fut.set_result(task.result())


async def _cache_media(tg, db, item: dict) -> str:
    """Download media from Telegram, write to cache, update DB. Returns cached file path."""
    media_id = item["id"]
    mime = item.get("mime_type", "application/octet-stream")
    data = await _download_full(tg, item)
    await asyncio.to_thread(CACHE_DIR.mkdir, parents=True, exist_ok=True)
    ext = mimetypes.guess_extension(mime) or ""
    download_path = CACHE_DIR / f"{media_id}_full{ext}"
    await asyncio.to_thread(download_path.write_bytes, data)
    await db.execute(
        "UPDATE media_items SET download_path = ? WHERE id = ?",
        (str(download_path), media_id),
    )
    await db.commit()
    return str(download_path)


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
    faces: Literal["none", "solo", "group"] | None = Query(None),
    sort: Literal["asc", "desc"] = Query("desc"),
):
    cursor_id, cursor_value = parse_cursor(cursor)
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
        faces=faces,
        sort=sort,
    )
    return build_media_response(items, limit, cursor_column="date")


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
                path = await asyncio.wait_for(_ensure_cached(tg, item), timeout=120)
                return (item, path)
            except TimeoutError:
                logger.warning("Timed out downloading item %s", item["id"])
                return None
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

    @field_validator("media_ids")
    @classmethod
    def check_not_empty(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError("No media IDs provided")
        return v


UnhideBatchRequest = BatchIdsRequest


@router.get("/hidden")
async def list_hidden_media(
    db: aiosqlite.Connection = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    sort: Literal["asc", "desc"] = Query("desc"),
):
    cursor_id, cursor_value = parse_cursor(cursor)
    items = await get_hidden_media_page(
        db,
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        limit=limit,
        sort=sort,
    )
    return build_media_response(items, limit, cursor_column="hidden_at")


@router.get("/hidden/count")
async def hidden_media_count(db: aiosqlite.Connection = Depends(get_db)):
    count = await get_hidden_count(db)
    return {"count": count}


@router.get("/hidden/ids")
async def hidden_media_ids(
    db: aiosqlite.Connection = Depends(get_db),
    sort: Literal["asc", "desc"] = Query("desc"),
):
    ids = await get_hidden_media_ids(db, sort=sort)
    return {"ids": ids}


@router.post("/unhide-batch")
async def unhide_media_batch(
    body: UnhideBatchRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await unhide_media_items(db, body.media_ids)
    return {"success": True}


@router.post("/hide-batch")
async def hide_media_batch(
    body: BatchIdsRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await hide_media_items(db, body.media_ids)
    return {"success": True}


@router.post("/favorite-batch")
async def favorite_media_batch(
    body: BatchIdsRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await favorite_media_items(db, body.media_ids)
    return {"success": True}


@router.post("/unfavorite-batch")
async def unfavorite_media_batch(
    body: BatchIdsRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await unfavorite_media_items(db, body.media_ids)
    return {"success": True}


@router.get("/favorites")
async def list_favorites_media(
    db: aiosqlite.Connection = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    sort: Literal["asc", "desc"] = Query("desc"),
):
    cursor_id, cursor_value = parse_cursor(cursor)
    items = await get_favorites_media_page(
        db,
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        limit=limit,
        sort=sort,
    )
    return build_media_response(items, limit, cursor_column="favorited_at")


@router.get("/favorites/count")
async def favorites_media_count(db: aiosqlite.Connection = Depends(get_db)):
    count = await get_favorites_count(db)
    return {"count": count}


@router.get("/favorites/ids")
async def favorites_media_ids(
    db: aiosqlite.Connection = Depends(get_db),
    sort: Literal["asc", "desc"] = Query("desc"),
):
    ids = await get_favorites_media_ids(db, sort=sort)
    return {"ids": ids}


@router.get("/count")
async def media_count(
    db: aiosqlite.Connection = Depends(get_db),
    groups: str | None = Query(None),
    type: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    faces: Literal["none", "solo", "group"] | None = Query(None),
):
    group_ids = [int(g) for g in groups.split(",")] if groups else None
    count = await get_media_count(
        db,
        group_ids=group_ids,
        media_type=type,
        date_from=date_from,
        date_to=date_to,
        faces=faces,
    )
    return {"count": count}


@router.get("/ids")
async def media_ids(
    db: aiosqlite.Connection = Depends(get_db),
    groups: str | None = Query(None),
    type: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    faces: Literal["none", "solo", "group"] | None = Query(None),
    sort: Literal["asc", "desc"] = Query("desc"),
):
    group_ids = [int(g) for g in groups.split(",")] if groups else None
    ids = await get_media_ids(
        db,
        group_ids=group_ids,
        media_type=type,
        date_from=date_from,
        date_to=date_to,
        faces=faces,
        sort=sort,
    )
    return {"ids": ids}


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
    bg_tasks: set[asyncio.Task] = Depends(get_background_tasks),
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

    # Non-video: fire background task, shield the await so disconnects don't cancel it
    if item.get("media_type") != "video":
        # Join an in-flight download if one exists
        if media_id in _download_registry:
            fut = _download_registry[media_id]
        else:
            fut = asyncio.get_event_loop().create_future()
            _download_registry[media_id] = fut
            task = fire_and_forget(_cache_media(tg, db, item), bg_tasks)
            task.add_done_callback(
                lambda t: (
                    _resolve_future(fut, t),
                    _download_registry.pop(media_id, None),
                )
            )

        try:
            download_path = await asyncio.shield(fut)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Unexpected error downloading media %s", media_id)
            raise HTTPException(
                status_code=502, detail="Failed to download media from Telegram"
            )

        return FileResponse(download_path, media_type=mime, headers=cache_headers)

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
                # Re-download fully in the background so the file gets cached
                if media_id not in _download_registry:
                    bg_fut = asyncio.get_event_loop().create_future()
                    bg_task = fire_and_forget(_cache_media(tg, db, item), bg_tasks)
                    bg_task.add_done_callback(
                        lambda t: (
                            _resolve_future(bg_fut, t),
                            _download_registry.pop(media_id, None),
                        )
                    )
                    _download_registry[media_id] = bg_fut
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
