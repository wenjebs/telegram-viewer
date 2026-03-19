# Bulk Cache All Media — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a background job that pre-caches all media (full-res + thumbnails) across all chats, with pause/resume/cancel, DB-persisted state, and progress UI in sidebar + settings.

**Architecture:** New `cache_jobs` DB table (modeled after `face_scan_state`) stores job state with a resume cursor. A single background task iterates uncached items, yielding to on-demand requests via semaphore backoff. Frontend polls a status endpoint and renders progress in sidebar widget + settings panel.

**Tech Stack:** Python/FastAPI, SQLite (aiosqlite), React 19, TanStack Query, Tailwind CSS v4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-19-bulk-cache-all-media-design.md`

---

## File Structure

**Backend — Create:**
- `backend/routes/cache.py` — Cache job endpoints (start, status, pause, cancel) and background task
- `backend/tests/test_routes_cache.py` — Tests for cache endpoints and background task

**Backend — Modify:**
- `backend/database.py` — Add `cache_jobs` table to schema, add DB helper functions
- `backend/telegram_client.py` — Add `available_slots()` method
- `backend/main.py` — Register cache router, no new app state needed (jobs live in DB)
- `backend/deps.py` — No changes needed (reuses `get_db`, `get_tg`, `get_background_tasks`)

**Frontend — Create:**
- `frontend/src/hooks/useCacheJob.ts` — Hook for cache job state + mutations
- `frontend/src/hooks/__tests__/useCacheJob.test.ts` — Tests for the hook
- `frontend/src/components/CacheProgress.tsx` — Sidebar progress widget
- `frontend/src/components/__tests__/CacheProgress.test.tsx` — Tests for progress widget

**Frontend — Modify:**
- `frontend/src/api/schemas.ts` — Add `CacheJobStatus` Zod schema
- `frontend/src/api/client.ts` — Add cache API functions
- `frontend/src/components/Sidebar.tsx` — Render `CacheProgress` widget
- `frontend/src/components/SettingsPanel.tsx` — Add "Storage" section

---

## Task 1: Database Schema + Helpers

**Files:**
- Modify: `backend/database.py:22-110` (SCHEMA constant) and append new functions
- Test: `backend/tests/test_database_cache_jobs.py` (create)

- [ ] **Step 1: Write failing tests for cache job DB helpers**

Create `backend/tests/test_database_cache_jobs.py`:

```python
from __future__ import annotations

import pytest
import aiosqlite

from database import (
    init_db,
    get_cache_job_state,
    update_cache_job_state,
)


@pytest.fixture
async def db():
    conn = await aiosqlite.connect(":memory:")
    await init_db(conn)
    yield conn
    await conn.close()


@pytest.mark.asyncio
async def test_get_cache_job_state_default(db):
    """Returns idle defaults when no row exists."""
    state = await get_cache_job_state(db)
    assert state["status"] == "idle"
    assert state["total_items"] == 0
    assert state["cached_items"] == 0


@pytest.mark.asyncio
async def test_update_and_get_cache_job_state(db):
    """Update fields and read them back."""
    await update_cache_job_state(
        db,
        status="running",
        total_items=100,
        cached_items=0,
    )
    state = await get_cache_job_state(db)
    assert state["status"] == "running"
    assert state["total_items"] == 100
    assert state["cached_items"] == 0


@pytest.mark.asyncio
async def test_update_incremental_progress(db):
    """Incremental updates to cached_items."""
    await update_cache_job_state(db, status="running", total_items=50)
    await update_cache_job_state(db, cached_items=25)
    state = await get_cache_job_state(db)
    assert state["cached_items"] == 25
    assert state["total_items"] == 50


@pytest.mark.asyncio
async def test_update_rejects_invalid_fields(db):
    """Invalid field names raise ValueError."""
    with pytest.raises(ValueError, match="Invalid"):
        await update_cache_job_state(db, bogus_field=42)


@pytest.mark.asyncio
async def test_update_pause_and_resume(db):
    """Pause preserves cursor, resume continues."""
    await update_cache_job_state(
        db, status="running", total_items=100, last_media_id=42
    )
    await update_cache_job_state(db, status="paused")
    state = await get_cache_job_state(db)
    assert state["status"] == "paused"
    assert state["last_media_id"] == 42


@pytest.mark.asyncio
async def test_flood_wait_until(db):
    """flood_wait_until is stored and retrievable."""
    await update_cache_job_state(
        db, status="running", flood_wait_until="2026-03-19T12:00:00"
    )
    state = await get_cache_job_state(db)
    assert state["flood_wait_until"] == "2026-03-19T12:00:00"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_database_cache_jobs.py -v`
Expected: FAIL — `get_cache_job_state` and `update_cache_job_state` not found in database module

- [ ] **Step 3: Add cache_jobs table to SCHEMA**

In `backend/database.py`, append to the `SCHEMA` string (before the closing `"""`), after the `face_scan_state` table:

```sql
CREATE TABLE IF NOT EXISTS cache_jobs (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'idle',
    total_items     INTEGER NOT NULL DEFAULT 0,
    cached_items    INTEGER NOT NULL DEFAULT 0,
    skipped_items   INTEGER NOT NULL DEFAULT 0,
    failed_items    INTEGER NOT NULL DEFAULT 0,
    bytes_cached    INTEGER NOT NULL DEFAULT 0,
    last_media_id   INTEGER,
    flood_wait_until TEXT,
    started_at      DATETIME,
    completed_at    DATETIME,
    error           TEXT,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Note: Single-row table with `id=1` (same pattern as `face_scan_state`). No need for multiple job rows.

- [ ] **Step 4: Add DB helper functions**

Append to `backend/database.py` (new region after face scan functions):

```python
# region Cache Jobs

_CACHE_JOB_FIELDS = frozenset(
    {
        "status",
        "total_items",
        "cached_items",
        "skipped_items",
        "failed_items",
        "bytes_cached",
        "last_media_id",
        "flood_wait_until",
        "started_at",
        "completed_at",
        "error",
    }
)


async def get_cache_job_state(db: aiosqlite.Connection) -> dict:
    async with await db.execute("SELECT * FROM cache_jobs WHERE id = 1") as cursor:
        row = await cursor.fetchone()
    if not row:
        return {
            "status": "idle",
            "total_items": 0,
            "cached_items": 0,
            "skipped_items": 0,
            "failed_items": 0,
            "bytes_cached": 0,
            "last_media_id": None,
            "flood_wait_until": None,
            "started_at": None,
            "completed_at": None,
            "error": None,
        }
    return dict(row)


async def update_cache_job_state(db: aiosqlite.Connection, **kwargs) -> None:
    if not kwargs:
        return
    invalid = set(kwargs.keys()) - _CACHE_JOB_FIELDS
    if invalid:
        raise ValueError(f"Invalid cache_jobs fields: {invalid}")
    async with await db.execute("SELECT id FROM cache_jobs WHERE id = 1") as cursor:
        row = await cursor.fetchone()
    now = utc_now_iso()
    if not row:
        await db.execute(
            """INSERT INTO cache_jobs (id, status, total_items, cached_items,
               skipped_items, failed_items, bytes_cached, updated_at)
               VALUES (1, 'idle', 0, 0, 0, 0, 0, ?)""",
            (now,),
        )
    sets = ", ".join(f"{k} = :{k}" for k in kwargs)
    kwargs["now"] = now
    await db.execute(
        f"UPDATE cache_jobs SET {sets}, updated_at = :now WHERE id = 1",
        kwargs,
    )
    await db.commit()

# endregion
```

- [ ] **Step 5: Update `clear_all_media` to reset cache_jobs**

In `backend/database.py`, in the `clear_all_media` function (after the `face_scan_state` reset around line 502), add:

```python
    await db.execute(
        "UPDATE cache_jobs SET status = 'idle', total_items = 0, cached_items = 0, "
        "skipped_items = 0, failed_items = 0, bytes_cached = 0, last_media_id = NULL, "
        "flood_wait_until = NULL, error = NULL, updated_at = ? WHERE id = 1",
        (utc_now_iso(),),
    )
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_database_cache_jobs.py -v`
Expected: All 6 tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/database.py backend/tests/test_database_cache_jobs.py
git commit -m "feat: add cache_jobs table and DB helpers"
```

---

## Task 2: TelegramClientWrapper.available_slots()

**Files:**
- Modify: `backend/telegram_client.py:124-128`
- Test: `backend/tests/test_telegram_client.py`

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_telegram_client.py` (after the existing `test_acquire_and_release_semaphore`):

```python
@pytest.mark.asyncio
async def test_available_slots(wrapper):
    assert wrapper.available_slots() == 6
    await wrapper.acquire_semaphore()
    assert wrapper.available_slots() == 5
    wrapper.release_semaphore()
    assert wrapper.available_slots() == 6
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_telegram_client.py::test_available_slots -v`
Expected: FAIL — `AttributeError: 'TelegramClientWrapper' has no attribute 'available_slots'`

- [ ] **Step 3: Add available_slots method**

In `backend/telegram_client.py`, after `release_semaphore` (line 128):

```python
    def available_slots(self) -> int:
        """Number of free semaphore slots. Used by bulk cache to yield to on-demand requests."""
        return self._semaphore._value
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_telegram_client.py::test_available_slots -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/telegram_client.py backend/tests/test_telegram_client.py
git commit -m "feat: add TelegramClientWrapper.available_slots()"
```

---

## Task 3: Backend Cache Endpoints + Background Task

**Files:**
- Create: `backend/routes/cache.py`
- Create: `backend/tests/test_routes_cache.py`
- Modify: `backend/main.py` (register router)

- [ ] **Step 1: Write failing tests for endpoints**

Create `backend/tests/test_routes_cache.py`:

```python
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from database import insert_media_item, update_cache_job_state, get_cache_job_state
from helpers import make_media_item
from main import app


@pytest.fixture
async def seeded_db(real_db_app):
    """3 uncached photos."""
    for i in range(3):
        await insert_media_item(
            real_db_app,
            make_media_item(
                message_id=i,
                chat_id=1,
                chat_name="TestGroup",
                date=f"2026-03-{15 - i}T10:00:00",
                file_id=i * 10,
                access_hash=i * 100,
            ),
        )
    yield real_db_app


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# -- GET /media/cache/status --

@pytest.mark.asyncio
async def test_cache_status_idle(seeded_db):
    """Returns idle state when no job has run."""
    async with _client() as client:
        resp = await client.get("/media/cache/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "idle"
    assert data["total_items"] == 0


@pytest.mark.asyncio
async def test_cache_status_running(seeded_db):
    """Returns running state with progress."""
    await update_cache_job_state(
        seeded_db, status="running", total_items=100, cached_items=42
    )
    async with _client() as client:
        resp = await client.get("/media/cache/status")
    data = resp.json()
    assert data["status"] == "running"
    assert data["cached_items"] == 42
    assert data["total_items"] == 100


# -- POST /media/cache/start --

@pytest.mark.asyncio
async def test_cache_start(seeded_db, mock_tg, mock_bg_tasks):
    """Start creates a running job with correct total."""
    mock_tg.available_slots = MagicMock(return_value=6)
    mock_tg.acquire_semaphore = AsyncMock()
    mock_tg.release_semaphore = MagicMock()
    mock_tg.client.get_messages = AsyncMock(return_value=None)

    async with _client() as client:
        resp = await client.post("/media/cache/start")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "running"
    assert data["total_items"] == 3  # 3 uncached photos


@pytest.mark.asyncio
async def test_cache_start_resumes_paused(seeded_db, mock_tg, mock_bg_tasks):
    """Start resumes a paused job rather than creating a new one."""
    mock_tg.available_slots = MagicMock(return_value=6)
    mock_tg.acquire_semaphore = AsyncMock()
    mock_tg.release_semaphore = MagicMock()
    mock_tg.client.get_messages = AsyncMock(return_value=None)

    await update_cache_job_state(
        seeded_db, status="paused", total_items=100, cached_items=50, last_media_id=2
    )
    async with _client() as client:
        resp = await client.post("/media/cache/start")
    data = resp.json()
    assert data["status"] == "running"
    assert data["cached_items"] == 50  # preserved from paused state


@pytest.mark.asyncio
async def test_cache_start_already_running(seeded_db, mock_bg_tasks):
    """Start while running returns current state without restarting."""
    await update_cache_job_state(
        seeded_db, status="running", total_items=100, cached_items=50
    )
    async with _client() as client:
        resp = await client.post("/media/cache/start")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "running"


# -- POST /media/cache/pause --

@pytest.mark.asyncio
async def test_cache_pause(seeded_db):
    """Pause sets status to paused."""
    await update_cache_job_state(seeded_db, status="running", total_items=100)
    async with _client() as client:
        resp = await client.post("/media/cache/pause")
    assert resp.status_code == 200
    state = await get_cache_job_state(seeded_db)
    assert state["status"] == "paused"


@pytest.mark.asyncio
async def test_cache_pause_not_running(seeded_db):
    """Pause when idle returns 409."""
    async with _client() as client:
        resp = await client.post("/media/cache/pause")
    assert resp.status_code == 409


# -- POST /media/cache/cancel --

@pytest.mark.asyncio
async def test_cache_cancel(seeded_db):
    """Cancel resets job to idle."""
    await update_cache_job_state(
        seeded_db, status="paused", total_items=100, cached_items=50
    )
    async with _client() as client:
        resp = await client.post("/media/cache/cancel")
    assert resp.status_code == 200
    state = await get_cache_job_state(seeded_db)
    assert state["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cache_cancel_idle(seeded_db):
    """Cancel when idle returns 409."""
    async with _client() as client:
        resp = await client.post("/media/cache/cancel")
    assert resp.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_routes_cache.py -v`
Expected: FAIL — import errors (routes/cache.py doesn't exist)

- [ ] **Step 3: Create cache routes module**

Create `backend/routes/cache.py`:

```python
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
```

- [ ] **Step 4: Register cache router in main.py**

In `backend/main.py`, add import and include:

```python
from routes.cache import router as cache_router
```

And with the other `app.include_router` calls:

```python
app.include_router(cache_router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_routes_cache.py -v`
Expected: All 8 tests PASS

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && uv run pytest -x -q`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add backend/routes/cache.py backend/tests/test_routes_cache.py backend/main.py
git commit -m "feat: add cache job endpoints (start/status/pause/cancel)"
```

---

## Task 4: Frontend Zod Schema + API Client

**Files:**
- Modify: `frontend/src/api/schemas.ts`
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/src/api/__tests__/schemas.test.ts` (extend if pattern exists)

- [ ] **Step 1: Write failing test for schema validation**

If `frontend/src/api/__tests__/schemas.test.ts` exists, append a test. Otherwise create one:

```typescript
import { describe, it, expect } from 'vitest'
import { CacheJobStatus } from '#/api/schemas'

describe('CacheJobStatus', () => {
  it('parses a valid running status', () => {
    const data = {
      status: 'running',
      total_items: 100,
      cached_items: 42,
      skipped_items: 10,
      failed_items: 2,
      bytes_cached: 5000000,
      flood_wait_until: null,
      error: null,
    }
    expect(CacheJobStatus.parse(data)).toEqual(data)
  })

  it('rejects invalid status', () => {
    expect(() =>
      CacheJobStatus.parse({ status: 'bogus', total_items: 0 }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run vitest run src/api/__tests__/schemas.test.ts`
Expected: FAIL — `CacheJobStatus` not found

- [ ] **Step 3: Add Zod schema**

In `frontend/src/api/schemas.ts`, after `ZipStatusResponse` (line 77):

```typescript
export const CacheJobStatus = z.object({
  status: z.enum([
    'idle',
    'running',
    'paused',
    'completed',
    'cancelled',
    'error',
  ]),
  total_items: z.number(),
  cached_items: z.number(),
  skipped_items: z.number(),
  failed_items: z.number(),
  bytes_cached: z.number(),
  flood_wait_until: z.string().nullable(),
  error: z.string().nullable(),
})
```

In the inferred types section (after line 132):

```typescript
export type CacheJobStatus = z.infer<typeof CacheJobStatus>
```

- [ ] **Step 4: Add API client functions**

In `frontend/src/api/client.ts`, after the zip functions (line 363), add:

```typescript
// Bulk cache
export const getCacheStatus = () =>
  fetchJSON('/media/cache/status', CacheJobStatus)

export const startCacheJob = () =>
  fetchJSON('/media/cache/start', z.object({
    status: z.string(),
    total_items: z.number(),
    cached_items: z.number(),
    skipped_items: z.number(),
  }), { method: 'POST' })

export const pauseCacheJob = () =>
  fetchJSON('/media/cache/pause', z.object({ status: z.string() }), {
    method: 'POST',
  })

export const cancelCacheJob = () =>
  fetchJSON('/media/cache/cancel', z.object({ status: z.string() }), {
    method: 'POST',
  })
```

Add `CacheJobStatus` to the imports from `schemas.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/api/__tests__/schemas.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/schemas.ts frontend/src/api/client.ts frontend/src/api/__tests__/schemas.test.ts
git commit -m "feat: add CacheJobStatus schema and API client functions"
```

---

## Task 5: useCacheJob Hook

**Files:**
- Create: `frontend/src/hooks/useCacheJob.ts`
- Create: `frontend/src/hooks/__tests__/useCacheJob.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/hooks/__tests__/useCacheJob.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'
import { createWrapper } from '#/test/wrapper'
import { useCacheJob } from '#/hooks/useCacheJob'

describe('useCacheJob', () => {
  it('starts idle with no job', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: 'idle',
          total_items: 0,
          cached_items: 0,
          skipped_items: 0,
          failed_items: 0,
          bytes_cached: 0,
          flood_wait_until: null,
          error: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch

    const { result } = renderHook(() => useCacheJob(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.status?.status).toBe('idle'))
    expect(result.current.isRunning).toBe(false)
  })

  it('start triggers mutation and begins polling', async () => {
    let callCount = 0
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('/start')) {
        return new Response(
          JSON.stringify({
            status: 'running',
            total_items: 50,
            cached_items: 0,
            skipped_items: 10,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/status')) {
        callCount++
        return new Response(
          JSON.stringify({
            status: 'running',
            total_items: 50,
            cached_items: callCount * 5,
            skipped_items: 10,
            failed_items: 0,
            bytes_cached: callCount * 1000,
            flood_wait_until: null,
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useCacheJob(), {
      wrapper: createWrapper(),
    })

    act(() => result.current.start())

    await waitFor(() => expect(result.current.isRunning).toBe(true))
  })

  it('pause calls pause endpoint', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('/pause')) {
        return new Response(
          JSON.stringify({ status: 'paused' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/status')) {
        return new Response(
          JSON.stringify({
            status: 'running',
            total_items: 50,
            cached_items: 25,
            skipped_items: 0,
            failed_items: 0,
            bytes_cached: 5000,
            flood_wait_until: null,
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch
    globalThis.fetch = fetchMock

    const { result } = renderHook(() => useCacheJob(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.status).toBeDefined())
    act(() => result.current.pause())

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/pause'),
        expect.anything(),
      ),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/hooks/__tests__/useCacheJob.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useCacheJob hook**

Create `frontend/src/hooks/useCacheJob.ts`:

```typescript
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getCacheStatus,
  startCacheJob,
  pauseCacheJob,
  cancelCacheJob,
} from '#/api/client'
import type { CacheJobStatus } from '#/api/schemas'

export function useCacheJob() {
  const qc = useQueryClient()

  const { data: status } = useQuery({
    queryKey: ['cacheJobStatus'],
    queryFn: getCacheStatus,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'running' ? 3000 : false
    },
  })

  const startMutation = useMutation({
    mutationFn: startCacheJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cacheJobStatus'] }),
    onError: () => toast.error('Failed to start caching'),
  })

  const pauseMutation = useMutation({
    mutationFn: pauseCacheJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cacheJobStatus'] }),
    onError: () => toast.error('Failed to pause caching'),
  })

  const cancelMutation = useMutation({
    mutationFn: cancelCacheJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cacheJobStatus'] }),
    onError: () => toast.error('Failed to cancel caching'),
  })

  const start = useCallback(() => startMutation.mutate(), [startMutation])
  const pause = useCallback(() => pauseMutation.mutate(), [pauseMutation])
  const cancel = useCallback(() => cancelMutation.mutate(), [cancelMutation])

  const isRunning = status?.status === 'running'
  const isPaused = status?.status === 'paused'
  const isCompleted = status?.status === 'completed'

  return {
    status: status as CacheJobStatus | undefined,
    start,
    pause,
    cancel,
    isRunning,
    isPaused,
    isCompleted,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/hooks/__tests__/useCacheJob.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useCacheJob.ts frontend/src/hooks/__tests__/useCacheJob.test.ts
git commit -m "feat: add useCacheJob hook with polling and mutations"
```

---

## Task 6: CacheProgress Sidebar Widget

**Files:**
- Create: `frontend/src/components/CacheProgress.tsx`
- Create: `frontend/src/components/__tests__/CacheProgress.test.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Write failing tests for CacheProgress component**

Create `frontend/src/components/__tests__/CacheProgress.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { createWrapper } from '#/test/wrapper'
import CacheProgress from '#/components/CacheProgress'

// Mock the hook
vi.mock('#/hooks/useCacheJob', () => ({
  useCacheJob: vi.fn(),
}))

import { useCacheJob } from '#/hooks/useCacheJob'

const mockUseCacheJob = vi.mocked(useCacheJob)

function renderWithWrapper(ui: React.ReactElement) {
  return render(ui, { wrapper: createWrapper() })
}

describe('CacheProgress', () => {
  it('shows start button when idle', () => {
    mockUseCacheJob.mockReturnValue({
      status: {
        status: 'idle',
        total_items: 0,
        cached_items: 0,
        skipped_items: 0,
        failed_items: 0,
        bytes_cached: 0,
        flood_wait_until: null,
        error: null,
      },
      start: vi.fn(),
      pause: vi.fn(),
      cancel: vi.fn(),
      isRunning: false,
      isPaused: false,
      isCompleted: false,
    })
    renderWithWrapper(<CacheProgress />)
    expect(screen.getByText(/cache all media/i)).toBeInTheDocument()
  })

  it('shows progress when running', () => {
    mockUseCacheJob.mockReturnValue({
      status: {
        status: 'running',
        total_items: 100,
        cached_items: 42,
        skipped_items: 0,
        failed_items: 0,
        bytes_cached: 5000000,
        flood_wait_until: null,
        error: null,
      },
      start: vi.fn(),
      pause: vi.fn(),
      cancel: vi.fn(),
      isRunning: true,
      isPaused: false,
      isCompleted: false,
    })
    renderWithWrapper(<CacheProgress />)
    expect(screen.getByText(/42/)).toBeInTheDocument()
    expect(screen.getByText(/100/)).toBeInTheDocument()
  })

  it('shows resume button when paused', () => {
    mockUseCacheJob.mockReturnValue({
      status: {
        status: 'paused',
        total_items: 100,
        cached_items: 50,
        skipped_items: 0,
        failed_items: 0,
        bytes_cached: 5000000,
        flood_wait_until: null,
        error: null,
      },
      start: vi.fn(),
      pause: vi.fn(),
      cancel: vi.fn(),
      isRunning: false,
      isPaused: true,
      isCompleted: false,
    })
    renderWithWrapper(<CacheProgress />)
    expect(screen.getByText(/paused/i)).toBeInTheDocument()
  })

  it('calls start when start button clicked', () => {
    const startFn = vi.fn()
    mockUseCacheJob.mockReturnValue({
      status: {
        status: 'idle',
        total_items: 0,
        cached_items: 0,
        skipped_items: 0,
        failed_items: 0,
        bytes_cached: 0,
        flood_wait_until: null,
        error: null,
      },
      start: startFn,
      pause: vi.fn(),
      cancel: vi.fn(),
      isRunning: false,
      isPaused: false,
      isCompleted: false,
    })
    renderWithWrapper(<CacheProgress />)
    fireEvent.click(screen.getByText(/cache all media/i))
    expect(startFn).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/CacheProgress.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CacheProgress component**

Create `frontend/src/components/CacheProgress.tsx`:

```tsx
import { Download, Pause, Play } from 'lucide-react'
import { useCacheJob } from '#/hooks/useCacheJob'

export default function CacheProgress() {
  const { status, start, pause, isRunning, isPaused } = useCacheJob()

  if (!status) return null

  // Completed or cancelled — don't show anything
  if (status.status === 'completed' || status.status === 'cancelled') {
    return null
  }

  // Idle — show start button
  if (status.status === 'idle') {
    return (
      <button
        type="button"
        onClick={start}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-text-soft transition-colors hover:bg-hover"
      >
        <Download className="size-3.5" />
        Cache all media
      </button>
    )
  }

  // Running or paused — show progress
  const progress =
    status.total_items > 0
      ? (status.cached_items / status.total_items) * 100
      : 0

  return (
    <div className="rounded-md bg-surface-strong p-2 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-text-soft">
          {isPaused ? 'Paused' : status.flood_wait_until ? 'Rate limited' : 'Caching...'}
        </span>
        <div className="flex items-center gap-1">
          <span className="font-medium text-accent tabular-nums">
            {status.cached_items} / {status.total_items}
          </span>
          {isRunning ? (
            <button
              type="button"
              onClick={pause}
              className="rounded p-0.5 text-text-soft transition-colors hover:bg-hover hover:text-text"
            >
              <Pause className="size-3" />
            </button>
          ) : isPaused ? (
            <button
              type="button"
              onClick={start}
              className="rounded p-0.5 text-text-soft transition-colors hover:bg-hover hover:text-text"
            >
              <Play className="size-3" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-sm bg-surface">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/CacheProgress.test.tsx`
Expected: All 4 tests PASS

- [ ] **Step 5: Add CacheProgress to Sidebar**

In `frontend/src/components/Sidebar.tsx`, import and render the widget above the sync/clear buttons area. Add import:

```typescript
import CacheProgress from '#/components/CacheProgress'
```

Render `<CacheProgress />` in the sidebar footer section, above the sync/clear button row.

- [ ] **Step 6: Run Sidebar tests to verify no regressions**

Run: `cd frontend && bun run vitest run src/components/__tests__/Sidebar.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CacheProgress.tsx frontend/src/components/__tests__/CacheProgress.test.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat: add CacheProgress sidebar widget"
```

---

## Task 7: Settings Panel — Storage Section

**Files:**
- Modify: `frontend/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Read current SettingsPanel**

Read `frontend/src/components/SettingsPanel.tsx` to find exact insertion point.

- [ ] **Step 2: Add Storage section**

Import `useCacheJob` and add a new "Storage" section after the existing "Backup" section:

```tsx
import { useCacheJob } from '#/hooks/useCacheJob'

// Inside the component:
const { status: cacheStatus, start: startCache, pause: pauseCache, cancel: cancelCache, isRunning, isPaused } = useCacheJob()

// After Backup section:
<section>
  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-soft">
    Storage
  </h3>
  <button
    type="button"
    onClick={isRunning ? pauseCache : startCache}
    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text transition-colors hover:bg-hover"
  >
    {isRunning ? 'Pause caching' : isPaused ? 'Resume caching' : 'Cache all media'}
  </button>
  <p className="mt-1 px-2 text-xs text-text-soft">
    Downloads all media to the server. Best used when you&apos;re not actively browsing.
  </p>
  {cacheStatus && cacheStatus.status !== 'idle' && (
    <div className="mt-2 px-2 text-xs text-text-soft">
      {cacheStatus.cached_items} / {cacheStatus.total_items} items
      {cacheStatus.bytes_cached > 0 && (
        <> &middot; {(cacheStatus.bytes_cached / 1024 / 1024).toFixed(1)} MB</>
      )}
    </div>
  )}
  {(isPaused || cacheStatus?.status === 'error') && (
    <button
      type="button"
      onClick={cancelCache}
      className="mt-1 px-2 text-xs text-danger transition-colors hover:text-danger/80"
    >
      Cancel
    </button>
  )}
</section>
```

- [ ] **Step 3: Run frontend check**

Run: `cd frontend && bun run check`
Expected: No lint/format errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SettingsPanel.tsx
git commit -m "feat: add Storage section to SettingsPanel with cache controls"
```

---

## Task 8: Integration Test + Final Verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && uv run pytest -x -q`
Expected: All tests pass

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && bun run vitest run`
Expected: All tests pass

- [ ] **Step 3: Run frontend type check**

Run: `cd frontend && bun run check`
Expected: No errors

- [ ] **Step 4: Manual smoke test**

Start the dev server and verify:
1. `GET /media/cache/status` returns idle state
2. `POST /media/cache/start` starts a job
3. Sidebar shows progress widget
4. Settings panel shows Storage section with controls
5. `POST /media/cache/pause` pauses the job
6. `POST /media/cache/start` resumes from where it paused

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration issues from smoke test"
```
