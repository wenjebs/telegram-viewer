from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import upsert_sync_state, get_sync_state
from indexer import index_chat

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


@router.get("")
async def list_groups():
    tg = get_tg()
    db = get_db()
    dialogs = await tg.get_dialogs()
    # Enrich with sync state
    for d in dialogs:
        state = await get_sync_state(db, d["id"])
        d["active"] = bool(state and state["active"]) if state else False
        d["last_synced"] = state["last_synced"] if state else None
    return dialogs


@router.patch("/{chat_id}/active")
async def toggle_active(chat_id: int, req: ToggleActiveRequest):
    db = get_db()
    await upsert_sync_state(db, chat_id=chat_id, chat_name=req.chat_name, active=req.active)
    return {"success": True}


@router.post("/{chat_id}/sync")
async def sync_group(chat_id: int):
    tg = get_tg()
    db = get_db()

    state = await get_sync_state(db, chat_id)
    chat_name = state["chat_name"] if state else str(chat_id)

    _sync_status[chat_id] = {"status": "syncing", "progress": 0, "total": 0}

    async def event_stream():
        try:
            async for progress, total in index_chat(tg, db, chat_id, chat_name):
                _sync_status[chat_id] = {"status": "syncing", "progress": progress, "total": total}
                yield f"data: {{\"progress\": {progress}, \"total\": {total}}}\n\n"
            _sync_status[chat_id] = {"status": "done", "progress": 0, "total": 0}
            yield f"data: {{\"status\": \"done\"}}\n\n"
        except Exception as e:
            _sync_status[chat_id] = {"status": "error", "progress": 0, "total": 0}
            yield f"data: {json.dumps({'status': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/{chat_id}/sync-status")
async def sync_status(chat_id: int):
    return _sync_status.get(chat_id, {"status": "idle", "progress": 0, "total": 0})
