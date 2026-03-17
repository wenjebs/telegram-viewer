from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import HTTPException

logger = logging.getLogger(__name__)


def fire_and_forget(coro, task_set: set[asyncio.Task]) -> asyncio.Task:
    """Create a tracked background task that won't be GC'd."""
    task = asyncio.create_task(coro)
    task_set.add(task)

    def _on_done(t: asyncio.Task) -> None:
        task_set.discard(t)
        if t.cancelled():
            return
        exc = t.exception()
        if exc:
            logger.error("Background task failed: %s", exc, exc_info=exc)

    task.add_done_callback(_on_done)
    return task


def utc_now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def parse_cursor(cursor: str | None) -> tuple[int | None, str | None]:
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


def build_media_response(
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
