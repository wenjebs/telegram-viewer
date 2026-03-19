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
async def test_cache_start_already_running(seeded_db, mock_tg, mock_bg_tasks):
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
