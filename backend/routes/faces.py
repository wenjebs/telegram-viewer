from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

import numpy as np

from database import (
    get_face_scan_state,
    update_face_scan_state,
    get_person_count,
    get_all_persons,
    get_person,
    get_person_embeddings,
    rename_person,
    merge_persons,
    merge_persons_batch,
    remove_face_from_person,
    get_person_media_page,
    get_person_media_ids,
    delete_person,
    get_cross_person_conflicts,
)
from deps import get_db, get_tg, get_background_tasks
from face_scanner import scan_faces
from utils import fire_and_forget, parse_cursor, build_media_response

if TYPE_CHECKING:
    import aiosqlite

    from telegram_client import TelegramClientWrapper

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/faces", tags=["faces"])




# region Pydantic models
class MergePersonsRequest(BaseModel):
    keep_id: int
    merge_id: int


class MergeBatchRequest(BaseModel):
    keep_id: int
    merge_ids: list[int]


class RenamePersonRequest(BaseModel):
    name: str


class ConflictsRequest(BaseModel):
    media_ids: list[int]
    exclude_person_id: int


# endregion


# region Background scan helper
async def _run_scan(
    db: aiosqlite.Connection,
    tg: TelegramClientWrapper,
    force: bool,
) -> None:
    # Error handling is inside scan_faces (sets status="error" on failure)
    await scan_faces(db, tg, force_rescan=force)


async def maybe_start_face_scan(
    db: aiosqlite.Connection,
    tg: TelegramClientWrapper,
    bg_tasks: set[asyncio.Task],
    force: bool = False,
) -> bool:
    """Start a face scan if one isn't already running. Returns True if started."""
    state = await get_face_scan_state(db)
    if state.get("status") in ("scanning", "clustering"):
        scan_running = any(
            not t.done() and t.get_name().startswith("face_scan") for t in bg_tasks
        )
        if scan_running:
            return False
        # Stale state — reset to idle so scan can resume
        await update_face_scan_state(db, status="idle")
    task = fire_and_forget(_run_scan(db, tg, force), bg_tasks)
    task.set_name("face_scan")
    return True


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
    started = await maybe_start_face_scan(db, tg, bg_tasks, force=force)
    if not started:
        state = await get_face_scan_state(db)
        return {
            "started": False,
            "status": state.get("status", "idle"),
            "scanned": state.get("scanned_count", 0),
            "total": state.get("total_count", 0),
        }
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


@router.post("/persons/merge-batch")
async def merge_persons_batch_endpoint(
    req: MergeBatchRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    if req.keep_id in req.merge_ids:
        raise HTTPException(status_code=400, detail="Cannot merge a person with itself")
    await merge_persons_batch(db, req.keep_id, req.merge_ids)
    return {"success": True}


@router.get("/persons/similar-groups")
async def similar_groups(
    threshold: float = Query(0.4, ge=0.0, le=1.0),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Return groups of persons whose representative faces are similar.

    Uses cosine similarity between representative face embeddings.
    The default threshold (0.4) is intentionally looser than the DBSCAN
    clustering eps (0.35 cosine distance = 0.65 similarity) to catch
    persons that were split into separate clusters.
    """
    rows = await get_person_embeddings(db)
    if len(rows) < 2:
        return {"groups": []}

    person_ids = [r["person_id"] for r in rows]
    embeddings = np.array(
        [np.frombuffer(r["embedding"], dtype=np.float32) for r in rows]
    )
    # L2-normalize
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    embeddings = embeddings / norms

    # Pairwise cosine similarity (dot product of normalized vectors)
    sim_matrix = embeddings @ embeddings.T

    # Union-find to group similar persons
    parent = list(range(len(person_ids)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(len(person_ids)):
        for j in range(i + 1, len(person_ids)):
            if sim_matrix[i, j] >= threshold:
                union(i, j)

    # Collect groups (only groups with 2+ members)
    group_map: dict[int, list[int]] = {}
    for idx, pid in enumerate(person_ids):
        root = find(idx)
        group_map.setdefault(root, []).append(pid)

    groups = [g for g in group_map.values() if len(g) >= 2]
    # Sort groups by size descending
    groups.sort(key=len, reverse=True)

    return {"groups": groups}


@router.post("/persons/conflicts")
async def check_conflicts(
    req: ConflictsRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    conflicts = await get_cross_person_conflicts(
        db, req.media_ids, req.exclude_person_id
    )
    return {"conflicts": conflicts}


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


@router.delete("/persons/{person_id}")
async def delete_person_endpoint(
    person_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    person = await get_person(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    crop_paths = await delete_person(db, person_id)
    # Clean up crop files (after DB commit, following established pattern)
    for path in crop_paths:
        try:
            Path(path).unlink(missing_ok=True)
        except OSError:
            logger.warning("Failed to delete crop file: %s", path)
    return {"success": True}


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
    sort: Literal["asc", "desc"] = Query("desc"),
    faces: Literal["none", "solo", "group"] | None = Query(None),
):
    cursor_id, cursor_value = parse_cursor(cursor)
    items = await get_person_media_page(
        db,
        person_id,
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        limit=limit,
        sort=sort,
        faces=faces,
    )
    return build_media_response(items, limit, cursor_column="date")


@router.get("/persons/{person_id}/media/ids")
async def person_media_ids(
    person_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    sort: Literal["asc", "desc"] = Query("desc"),
    faces: Literal["none", "solo", "group"] | None = Query(None),
):
    ids = await get_person_media_ids(db, person_id, faces=faces, sort=sort)
    return {"ids": ids}


@router.get("/{face_id}/crop")
async def get_face_crop(
    face_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    row = await db.execute("SELECT crop_path FROM faces WHERE id = ?", (face_id,))
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
