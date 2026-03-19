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
