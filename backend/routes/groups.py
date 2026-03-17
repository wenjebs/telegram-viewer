from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from cachetools import TTLCache
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from database import (
    upsert_sync_state,
    get_sync_state,
    get_all_sync_states,
    get_all_dialogs,
    clear_chat_media,
    clear_all_media,
    hide_dialog,
    unhide_dialogs,
    get_hidden_dialogs,
    get_hidden_dialog_count,
    deactivate_sync_state,
)
from deps import get_db, get_tg, get_sync_status, get_background_tasks
from indexer import index_chat, get_new_media_counts
from routes.faces import maybe_start_face_scan
from utils import fire_and_forget

if TYPE_CHECKING:
    import aiosqlite

    from telegram_client import TelegramClientWrapper

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/groups", tags=["groups"])


def _merge_sync_states(dialogs: list[dict], state_map: dict[int, dict]) -> list[dict]:
    result = []
    for d in dialogs:
        entry = {
            "id": d["id"],
            "name": d["name"],
            "type": d["type"],
            "unread_count": d.get("unread_count", 0),
            "hidden_at": d.get("hidden_at"),
        }
        state = state_map.get(d["id"])
        entry["active"] = bool(state and state["active"]) if state else False
        entry["last_synced"] = state["last_synced"] if state else None
        result.append(entry)
    return result


class ToggleActiveRequest(BaseModel):
    active: bool
    chat_name: str


class SyncAllRequest(BaseModel):
    chat_ids: list[int]


class UnhideBatchRequest(BaseModel):
    dialog_ids: list[int]


@router.get("")
async def list_groups(
    tg: TelegramClientWrapper = Depends(get_tg),
    db: aiosqlite.Connection = Depends(get_db),
    bg_tasks: set[asyncio.Task] = Depends(get_background_tasks),
):
    # Fast path: serve from DB
    dialogs = await get_all_dialogs(db)

    if not dialogs:
        # First load — no DB cache yet, must block on Telegram
        dialogs = await tg.get_dialogs()
    elif tg.is_cache_stale:
        # Trigger non-blocking background refresh if in-memory cache is stale
        fire_and_forget(tg.refresh_dialogs(), bg_tasks)

    # Merge sync state
    states = await get_all_sync_states(db)
    state_map = {s["chat_id"]: s for s in states}
    return _merge_sync_states(dialogs, state_map)


@router.post("/refresh")
async def refresh_groups(
    tg: TelegramClientWrapper = Depends(get_tg),
    bg_tasks: set[asyncio.Task] = Depends(get_background_tasks),
):
    """Trigger a manual Telegram dialog refresh."""
    fire_and_forget(tg.refresh_dialogs(), bg_tasks)
    return JSONResponse(status_code=202, content={"detail": "Refresh started"})


@router.get("/hidden")
async def list_hidden_groups(db: aiosqlite.Connection = Depends(get_db)):
    dialogs = await get_hidden_dialogs(db)
    states = await get_all_sync_states(db)
    state_map = {s["chat_id"]: s for s in states}
    return _merge_sync_states(dialogs, state_map)


@router.get("/hidden/count")
async def hidden_group_count(db: aiosqlite.Connection = Depends(get_db)):
    count = await get_hidden_dialog_count(db)
    return {"count": count}


@router.post("/unhide-batch")
async def unhide_groups_batch(
    req: UnhideBatchRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await unhide_dialogs(db, req.dialog_ids)
    return {"success": True}


# In-memory cache for preview counts.
# Note: per-process cache — each worker gets its own copy.
_preview_cache: TTLCache[int, tuple[int, dict] | None] = TTLCache(maxsize=1000, ttl=300)


@router.get("/preview-counts")
async def preview_counts(
    tg: TelegramClientWrapper = Depends(get_tg),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Get estimated new media counts for all active groups since their last sync."""
    states = await get_all_sync_states(db)
    active_states = [s for s in states if s["active"]]

    result: dict[str, dict | None] = {}
    to_fetch: list[dict] = []

    for state in active_states:
        cid = state["chat_id"]
        cached = _preview_cache.get(cid)
        if cached is not None:
            cached_min_id, counts = cached
            if cached_min_id == state["last_msg_id"]:
                result[str(cid)] = counts
                continue
        to_fetch.append(state)

    # Fetch uncached groups with concurrency limit
    sem = asyncio.Semaphore(3)

    async def _count(state: dict) -> None:
        async with sem:
            cid = state["chat_id"]
            min_id = state["last_msg_id"]
            counts = await get_new_media_counts(tg, cid, min_id=min_id)
            if counts is not None:
                _preview_cache[cid] = (min_id, counts)
            result[str(cid)] = counts

    await asyncio.gather(*[_count(s) for s in to_fetch])
    return result


@router.post("/{chat_id}/hide")
async def hide_group(
    chat_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    await hide_dialog(db, chat_id)
    return {"success": True}


@router.post("/{chat_id}/unhide")
async def unhide_group(
    chat_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    await unhide_dialogs(db, [chat_id])
    return {"success": True}


@router.post("/{chat_id}/unsync")
async def unsync_group(
    chat_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    sync_status: dict[int, dict] = Depends(get_sync_status),
):
    """Unsync a group: delete all media, reset sync state, deactivate."""
    current = sync_status.get(chat_id, {})
    if current.get("status") == "syncing":
        return JSONResponse(
            status_code=409,
            content={"detail": "Cannot unsync while sync is in progress"},
        )

    paths = await clear_chat_media(db, chat_id)
    await deactivate_sync_state(db, chat_id)
    for p in paths:
        await asyncio.to_thread(Path(p).unlink, missing_ok=True)
    _preview_cache.pop(chat_id, None)
    sync_status.pop(chat_id, None)
    return {"success": True}


@router.patch("/{chat_id}/active")
async def toggle_active(
    chat_id: int,
    req: ToggleActiveRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await upsert_sync_state(
        db, chat_id=chat_id, chat_name=req.chat_name, active=req.active
    )
    return {"success": True}


async def _run_sync(
    tg: TelegramClientWrapper,
    db: aiosqlite.Connection,
    sync_status: dict[int, dict],
    chat_id: int,
    bg_tasks: set[asyncio.Task],
) -> None:
    """Background coroutine that drives sync and updates in-memory status."""
    state = await get_sync_state(db, chat_id)
    chat_name = state["chat_name"] if state else str(chat_id)
    min_id = state["last_msg_id"] if state else 0

    # Reuse cached preview counts if they match the current min_id
    precomputed_counts = None
    cached = _preview_cache.get(chat_id)
    if cached is not None:
        cached_min_id, counts = cached
        if cached_min_id == min_id:
            precomputed_counts = counts

    try:
        async for event in index_chat(tg, db, chat_id, chat_name, precomputed_counts):
            sync_status[chat_id] = {
                "status": "done" if event.type == "done" else "syncing",
                "progress": event.progress,
                "total": event.total,
            }
        sync_status[chat_id] = {
            "status": "done",
            "progress": sync_status[chat_id].get("progress", 0),
            "total": sync_status[chat_id].get("total", 0),
        }
        _preview_cache.pop(chat_id, None)
        try:
            await maybe_start_face_scan(db, tg, bg_tasks)
        except Exception:
            logger.exception(
                "Auto face scan trigger failed after sync chat_id=%s", chat_id
            )
    except Exception:
        logger.exception("Sync failed for chat_id=%s", chat_id)
        sync_status[chat_id] = {"status": "error", "progress": 0, "total": 0}


@router.post("/{chat_id}/sync")
async def sync_group(
    chat_id: int,
    tg: TelegramClientWrapper = Depends(get_tg),
    db: aiosqlite.Connection = Depends(get_db),
    sync_status: dict[int, dict] = Depends(get_sync_status),
    bg_tasks: set[asyncio.Task] = Depends(get_background_tasks),
):
    current = sync_status.get(chat_id, {})
    if current.get("status") == "syncing":
        return JSONResponse(
            status_code=409,
            content={"detail": "Sync already in progress"},
        )

    sync_status[chat_id] = {"status": "syncing", "progress": 0, "total": 0}
    fire_and_forget(_run_sync(tg, db, sync_status, chat_id, bg_tasks), bg_tasks)
    return JSONResponse(status_code=202, content={"started": chat_id})


@router.post("/sync-all")
async def sync_all(
    req: SyncAllRequest,
    tg: TelegramClientWrapper = Depends(get_tg),
    db: aiosqlite.Connection = Depends(get_db),
    sync_status: dict[int, dict] = Depends(get_sync_status),
    bg_tasks: set[asyncio.Task] = Depends(get_background_tasks),
):
    started: list[int] = []
    for chat_id in req.chat_ids:
        current = sync_status.get(chat_id, {})
        if current.get("status") == "syncing":
            continue
        sync_status[chat_id] = {"status": "syncing", "progress": 0, "total": 0}
        fire_and_forget(_run_sync(tg, db, sync_status, chat_id, bg_tasks), bg_tasks)
        started.append(chat_id)
    return JSONResponse(status_code=202, content={"started": started})


@router.delete("/media")
async def clear_all_media_endpoint(db: aiosqlite.Connection = Depends(get_db)):
    paths = await clear_all_media(db)
    for p in paths:
        await asyncio.to_thread(Path(p).unlink, missing_ok=True)
    return {"success": True}


@router.delete("/{chat_id}/media")
async def clear_media(
    chat_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    paths = await clear_chat_media(db, chat_id)
    for p in paths:
        await asyncio.to_thread(Path(p).unlink, missing_ok=True)
    return {"success": True}


@router.get("/{chat_id}/sync-status")
async def sync_status_endpoint(
    chat_id: int,
    sync_status: dict[int, dict] = Depends(get_sync_status),
):
    return sync_status.get(chat_id, {"status": "idle", "progress": 0, "total": 0})
