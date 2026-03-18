from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from fastapi import APIRouter, File, HTTPException, UploadFile, Depends
from fastapi.responses import Response

from database import export_settings, import_settings
from deps import get_db

if TYPE_CHECKING:
    import aiosqlite

router = APIRouter(prefix="/settings", tags=["settings"])

MAX_IMPORT_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get("/export")
async def export_settings_route(db: aiosqlite.Connection = Depends(get_db)):
    data = await export_settings(db)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"telegram-viewer-settings-{today}.json"
    return Response(
        content=json.dumps(data, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def import_settings_route(
    file: UploadFile = File(...),
    db: aiosqlite.Connection = Depends(get_db),
):
    content = await file.read()
    if len(content) > MAX_IMPORT_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    try:
        data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=422, detail="Invalid JSON file")

    version = data.get("version")
    if version is None:
        raise HTTPException(status_code=422, detail="Missing version field")
    if version != 1:
        raise HTTPException(status_code=422, detail=f"Unsupported settings version: {version}")

    result = await import_settings(db, data)
    return result
