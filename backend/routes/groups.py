from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING

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
)
from deps import get_db, get_tg, get_sync_status, get_background_tasks
from indexer import index_chat
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
) -> None:
    """Background coroutine that drives sync and updates in-memory status."""
    state = await get_sync_state(db, chat_id)
    chat_name = state["chat_name"] if state else str(chat_id)

    try:
        async for event in index_chat(tg, db, chat_id, chat_name):
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
    fire_and_forget(_run_sync(tg, db, sync_status, chat_id), bg_tasks)
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
        fire_and_forget(_run_sync(tg, db, sync_status, chat_id), bg_tasks)
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
