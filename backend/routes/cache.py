from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from telethon.errors import FloodWaitError

from database import get_cache_job_state, update_cache_job_state
from deps import get_db, get_tg, get_background_tasks
from routes.media import _ensure_cached, _download_thumbnail, CACHE_DIR
from utils import fire_and_forget, utc_now_iso

if TYPE_CHECKING:
    import aiosqlite
    from telegram_client import TelegramClientWrapper

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/media/cache", tags=["cache"])


@router.get("/status")
async def cache_status(db: aiosqlite.Connection = Depends(get_db)) -> dict:
    state = await get_cache_job_state(db)
    return {
        "status": state["status"],
        "total_items": state["total_items"],
        "cached_items": state["cached_items"],
        "skipped_items": state["skipped_items"],
        "failed_items": state["failed_items"],
        "bytes_cached": state["bytes_cached"],
        "flood_wait_until": state["flood_wait_until"],
        "error": state["error"],
    }


@router.post("/start")
async def cache_start(
    db: aiosqlite.Connection = Depends(get_db),
    tg: TelegramClientWrapper = Depends(get_tg),
    bg_tasks: set[asyncio.Task] = Depends(get_background_tasks),
) -> dict:
    state = await get_cache_job_state(db)

    # Already running — return current state
    if state["status"] == "running":
        return {
            "status": state["status"],
            "total_items": state["total_items"],
            "cached_items": state["cached_items"],
            "skipped_items": state["skipped_items"],
        }

    # Resumable states: paused, error — keep existing progress
    if state["status"] in ("paused", "error"):
        await update_cache_job_state(db, status="running", error=None, flood_wait_until=None)
        task = fire_and_forget(_run_cache_job(db, tg), bg_tasks)
        task.set_name("cache_all")
        state = await get_cache_job_state(db)
        return {
            "status": state["status"],
            "total_items": state["total_items"],
            "cached_items": state["cached_items"],
            "skipped_items": state["skipped_items"],
        }

    # Fresh start (idle or cancelled) — count uncached items
    async with await db.execute(
        """SELECT COUNT(*) FROM media_items
           WHERE (download_path IS NULL OR thumbnail_path IS NULL)
           AND hidden_at IS NULL"""
    ) as cursor:
        (total,) = await cursor.fetchone()

    # Count already-cached items (both paths set)
    async with await db.execute(
        """SELECT COUNT(*) FROM media_items
           WHERE download_path IS NOT NULL AND thumbnail_path IS NOT NULL
           AND hidden_at IS NULL"""
    ) as cursor:
        (skipped,) = await cursor.fetchone()

    await update_cache_job_state(
        db,
        status="running",
        total_items=total,
        cached_items=0,
        skipped_items=skipped,
        failed_items=0,
        bytes_cached=0,
        last_media_id=None,
        flood_wait_until=None,
        started_at=utc_now_iso(),
        completed_at=None,
        error=None,
    )

    task = fire_and_forget(_run_cache_job(db, tg), bg_tasks)
    task.set_name("cache_all")

    state = await get_cache_job_state(db)
    return {
        "status": state["status"],
        "total_items": state["total_items"],
        "cached_items": state["cached_items"],
        "skipped_items": state["skipped_items"],
    }


@router.post("/pause")
async def cache_pause(db: aiosqlite.Connection = Depends(get_db)) -> dict:
    state = await get_cache_job_state(db)
    if state["status"] != "running":
        raise HTTPException(status_code=409, detail="No running cache job to pause")
    await update_cache_job_state(db, status="paused")
    return {"status": "paused"}


@router.post("/cancel")
async def cache_cancel(db: aiosqlite.Connection = Depends(get_db)) -> dict:
    state = await get_cache_job_state(db)
    if state["status"] in ("idle", "cancelled"):
        raise HTTPException(status_code=409, detail="No active cache job to cancel")
    await update_cache_job_state(db, status="cancelled")
    return {"status": "cancelled"}


async def _backoff_if_busy(tg: TelegramClientWrapper) -> None:
    """Yield to on-demand requests by waiting when semaphore is busy."""
    while tg.available_slots() < 3:
        await asyncio.sleep(2)


async def _run_cache_job(
    db: aiosqlite.Connection,
    tg: TelegramClientWrapper,
) -> None:
    """Background task: iterate uncached items, download full media + thumbnails."""
    try:
        await asyncio.to_thread(CACHE_DIR.mkdir, parents=True, exist_ok=True)

        state = await get_cache_job_state(db)
        last_id = state.get("last_media_id") or 0
        cached_count = state.get("cached_items", 0)
        failed_count = state.get("failed_items", 0)
        bytes_total = state.get("bytes_cached", 0)

        while True:
            # Check for pause/cancel
            state = await get_cache_job_state(db)
            if state["status"] in ("paused", "cancelled"):
                return

            # Fetch next batch of uncached items
            async with await db.execute(
                """SELECT id, message_id, chat_id, chat_name, date,
                          media_type, mime_type, file_size,
                          thumbnail_path, download_path
                   FROM media_items
                   WHERE id > ?
                   AND (download_path IS NULL OR thumbnail_path IS NULL)
                   AND hidden_at IS NULL
                   ORDER BY id
                   LIMIT 50""",
                (last_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                items = [dict(row) for row in rows]

            if not items:
                break  # All done

            for item in items:
                # Re-check pause/cancel between items
                state = await get_cache_job_state(db)
                if state["status"] in ("paused", "cancelled"):
                    return

                await _backoff_if_busy(tg)

                try:
                    file_bytes = 0
                    # Download full media if needed
                    if not item.get("download_path"):
                        path = await asyncio.wait_for(
                            _ensure_cached(tg, item), timeout=120
                        )
                        await db.execute(
                            "UPDATE media_items SET download_path = ? WHERE id = ?",
                            (path, item["id"]),
                        )
                        file_bytes = os.path.getsize(path)

                    # Download thumbnail if needed
                    if not item.get("thumbnail_path"):
                        thumb_data = await asyncio.wait_for(
                            _download_thumbnail(tg, item), timeout=60
                        )
                        if thumb_data:
                            thumb_path = CACHE_DIR / f"{item['id']}.jpg"
                            await asyncio.to_thread(thumb_path.write_bytes, thumb_data)
                            await db.execute(
                                "UPDATE media_items SET thumbnail_path = ? WHERE id = ?",
                                (str(thumb_path), item["id"]),
                            )

                    await db.commit()
                    cached_count += 1
                    bytes_total += file_bytes

                except FloodWaitError as e:
                    wait_until = (
                        datetime.now(timezone.utc)
                        + timedelta(seconds=e.seconds)
                    ).isoformat()
                    logger.warning(
                        "FloodWaitError: sleeping %ds for item %s",
                        e.seconds,
                        item["id"],
                    )
                    await update_cache_job_state(
                        db, flood_wait_until=wait_until
                    )
                    await asyncio.sleep(e.seconds)
                    await update_cache_job_state(db, flood_wait_until=None)
                    # Retry this item by not advancing last_id
                    continue
                except TimeoutError:
                    logger.warning("Timed out caching item %s", item["id"])
                    failed_count += 1
                except Exception:
                    logger.warning("Failed to cache item %s", item["id"], exc_info=True)
                    failed_count += 1

                last_id = item["id"]
                await update_cache_job_state(
                    db,
                    cached_items=cached_count,
                    failed_items=failed_count,
                    bytes_cached=bytes_total,
                    last_media_id=last_id,
                )

                await asyncio.sleep(0.2)  # Rate limit safety

        await update_cache_job_state(
            db, status="completed", completed_at=utc_now_iso()
        )

    except Exception as exc:
        logger.exception("Cache job failed")
        await update_cache_job_state(db, status="error", error=str(exc))
