from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from database import (
    upsert_sync_state,
    get_sync_state,
    get_all_sync_states,
    get_all_dialogs,
    clear_chat_media,
    clear_all_media,
)
from indexer import index_chat
from utils import fire_and_forget

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/groups", tags=["groups"])

_tg = None
_db = None
_sync_status: dict[int, dict] = {}  # chat_id -> {status, progress, total}


def set_tg(tg):
    global _tg
    _tg = tg


def get_tg():
    return _tg


def set_db(db):
    global _db
    _db = db


def get_db():
    return _db


class ToggleActiveRequest(BaseModel):
    active: bool
    chat_name: str


class SyncAllRequest(BaseModel):
    chat_ids: list[int]


@router.get("")
async def list_groups():
    tg = get_tg()
    db = get_db()

    # Fast path: serve from DB
    dialogs = await get_all_dialogs(db)

    if not dialogs:
        # First load — no DB cache yet, must block on Telegram
        dialogs = await tg.get_dialogs()
    elif tg.is_cache_stale:
        # Trigger non-blocking background refresh if in-memory cache is stale
        fire_and_forget(tg.refresh_dialogs())

    # Merge sync state
    states = await get_all_sync_states(db)
    state_map = {s["chat_id"]: s for s in states}
    result = []
    for d in dialogs:
        entry = {
            "id": d["id"],
            "name": d["name"],
            "type": d["type"],
            "unread_count": d.get("unread_count", 0),
        }
        state = state_map.get(d["id"])
        entry["active"] = bool(state and state["active"]) if state else False
        entry["last_synced"] = state["last_synced"] if state else None
        result.append(entry)
    return result


@router.post("/refresh")
async def refresh_groups():
    """Trigger a manual Telegram dialog refresh."""
    tg = get_tg()
    fire_and_forget(tg.refresh_dialogs())
    return JSONResponse(status_code=202, content={"detail": "Refresh started"})


@router.patch("/{chat_id}/active")
async def toggle_active(chat_id: int, req: ToggleActiveRequest):
    db = get_db()
    await upsert_sync_state(
        db, chat_id=chat_id, chat_name=req.chat_name, active=req.active
    )
    return {"success": True}


async def _run_sync(chat_id: int) -> None:
    """Background coroutine that drives sync and updates in-memory status."""
    tg = get_tg()
    db = get_db()

    state = await get_sync_state(db, chat_id)
    chat_name = state["chat_name"] if state else str(chat_id)

    try:
        async for event in index_chat(tg, db, chat_id, chat_name):
            _sync_status[chat_id] = {
                "status": event.type if event.type != "done" else "done",
                "progress": event.progress,
                "total": event.total,
            }
        _sync_status[chat_id] = {
            "status": "done",
            "progress": _sync_status[chat_id].get("progress", 0),
            "total": _sync_status[chat_id].get("total", 0),
        }
    except Exception:
        logger.exception("Sync failed for chat_id=%s", chat_id)
        _sync_status[chat_id] = {"status": "error", "progress": 0, "total": 0}


@router.post("/{chat_id}/sync")
async def sync_group(chat_id: int):
    current = _sync_status.get(chat_id, {})
    if current.get("status") == "syncing":
        return JSONResponse(
            status_code=409,
            content={"detail": "Sync already in progress"},
        )

    _sync_status[chat_id] = {"status": "syncing", "progress": 0, "total": 0}
    fire_and_forget(_run_sync(chat_id))
    return JSONResponse(status_code=202, content={"started": chat_id})


@router.post("/sync-all")
async def sync_all(req: SyncAllRequest):
    started: list[int] = []
    for chat_id in req.chat_ids:
        current = _sync_status.get(chat_id, {})
        if current.get("status") == "syncing":
            continue
        _sync_status[chat_id] = {"status": "syncing", "progress": 0, "total": 0}
        fire_and_forget(_run_sync(chat_id))
        started.append(chat_id)
    return JSONResponse(status_code=202, content={"started": started})


@router.delete("/media")
async def clear_all_media_endpoint():
    db = get_db()
    paths = await clear_all_media(db)
    for p in paths:
        await asyncio.to_thread(Path(p).unlink, missing_ok=True)
    return {"success": True}


@router.delete("/{chat_id}/media")
async def clear_media(chat_id: int):
    db = get_db()
    # Collect thumbnail paths before deleting DB rows
    cursor = await db.execute(
        "SELECT thumbnail_path FROM media_items WHERE chat_id = ? AND thumbnail_path IS NOT NULL",
        (chat_id,),
    )
    rows = await cursor.fetchall()
    await clear_chat_media(db, chat_id)
    # Remove cached thumbnail files
    for row in rows:
        await asyncio.to_thread(Path(row[0]).unlink, missing_ok=True)
    return {"success": True}


@router.get("/{chat_id}/sync-status")
async def sync_status(chat_id: int):
    return _sync_status.get(chat_id, {"status": "idle", "progress": 0, "total": 0})
