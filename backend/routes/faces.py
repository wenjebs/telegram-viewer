from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from database import (
    get_face_scan_state,
    update_face_scan_state,
    get_person_count,
    get_all_persons,
    get_person,
    rename_person,
    merge_persons,
    remove_face_from_person,
    get_person_media_page,
)
from deps import get_db, get_tg, get_background_tasks
from face_scanner import scan_faces
from utils import fire_and_forget

if TYPE_CHECKING:
    import aiosqlite

    from telegram_client import TelegramClientWrapper

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/faces", tags=["faces"])


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


# region Pydantic models
class MergePersonsRequest(BaseModel):
    keep_id: int
    merge_id: int


class RenamePersonRequest(BaseModel):
    name: str


# endregion


# region Background scan helper
async def _run_scan(
    db: aiosqlite.Connection,
    tg: TelegramClientWrapper,
    force: bool,
) -> None:
    # Error handling is inside scan_faces (sets status="error" on failure)
    await scan_faces(db, tg, force_rescan=force)


# endregion


# region Routes — static routes first

@router.get("/scan-status")
async def scan_status(db: aiosqlite.Connection = Depends(get_db)):
    state = await get_face_scan_state(db)
    person_count = await get_person_count(db)
    return {
        "status": state.get("status", "idle"),
        "scanned": state.get("scanned_count", 0),
        "total": state.get("total_count", 0),
        "person_count": person_count,
    }


@router.post("/scan")
async def start_scan(
    force: bool = Query(False),
    db: aiosqlite.Connection = Depends(get_db),
    tg: TelegramClientWrapper = Depends(get_tg),
    bg_tasks: set[asyncio.Task] = Depends(get_background_tasks),
):
    state = await get_face_scan_state(db)
    if state.get("status") in ("scanning", "clustering"):
        # Check if a scan task is actually running — if not, the state is stale
        # from a crashed/restarted server. Reset it so the scan can resume.
        scan_running = any(
            not t.done() and t.get_name().startswith("face_scan")
            for t in bg_tasks
        )
        if scan_running:
            return JSONResponse(
                status_code=409,
                content={"detail": "Scan already in progress"},
            )
        # Stale state — reset to idle so scan can resume
        await update_face_scan_state(db, status="idle")
    task = fire_and_forget(_run_scan(db, tg, force), bg_tasks)
    task.set_name("face_scan")
    return {"started": True}


@router.get("/persons")
async def list_persons(db: aiosqlite.Connection = Depends(get_db)):
    persons = await get_all_persons(db)
    return persons


@router.post("/persons/merge")
async def merge_persons_endpoint(
    req: MergePersonsRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await merge_persons(db, req.keep_id, req.merge_id)
    return {"success": True}


# endregion


# region Routes — parameterized

@router.get("/persons/{person_id}")
async def get_person_endpoint(
    person_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    person = await get_person(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.patch("/persons/{person_id}")
async def rename_person_endpoint(
    person_id: int,
    req: RenamePersonRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await rename_person(db, person_id, req.name)
    return {"success": True}


@router.delete("/persons/{person_id}/faces/{face_id}")
async def remove_face(
    person_id: int,
    face_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    await remove_face_from_person(db, face_id)
    return {"success": True}


@router.get("/persons/{person_id}/media")
async def person_media(
    person_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    cursor_id, cursor_value = _parse_cursor(cursor)
    items = await get_person_media_page(
        db,
        person_id,
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        limit=limit,
    )
    return _build_media_response(items, limit, cursor_column="date")


@router.get("/{face_id}/crop")
async def get_face_crop(
    face_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    row = await db.execute(
        "SELECT crop_path FROM faces WHERE id = ?", (face_id,)
    )
    result = await row.fetchone()
    if not result or not result[0]:
        raise HTTPException(status_code=404, detail="Face crop not found")

    crop_path = Path(result[0])
    if not crop_path.exists():
        raise HTTPException(status_code=404, detail="Face crop file missing")

    return FileResponse(
        str(crop_path),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400, immutable"},
    )


# endregion
