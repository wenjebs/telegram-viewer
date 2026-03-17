"""Shared test fixtures for the backend test suite."""

from __future__ import annotations

from unittest.mock import AsyncMock

import aiosqlite
import pytest
from httpx import ASGITransport, AsyncClient

from database import init_db, insert_media_item, upsert_sync_state
from deps import get_background_tasks, get_db, get_sync_status, get_tg, get_zip_jobs
from main import app

# Re-export helpers so other test modules can do `from helpers import ...`
# while conftest uses them internally for seeded_db.
from helpers import make_media_item  # noqa: F401


# ---------------------------------------------------------------------------
# Core database fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def db():
    """In-memory SQLite database with schema initialized."""
    conn = await aiosqlite.connect(":memory:")
    await init_db(conn)
    yield conn
    await conn.close()


@pytest.fixture
async def seeded_db(db):
    """Database pre-loaded with 5 media items across 2 chats, 1 dialog, and 1 sync_state row."""
    # 3 photos in chat 1
    for i in range(3):
        await insert_media_item(
            db,
            make_media_item(
                message_id=i,
                chat_id=1,
                chat_name="TestGroup",
                date=f"2026-03-{15 - i}T10:00:00",
                caption=f"photo {i}",
                file_id=i * 10,
                access_hash=i * 100,
            ),
        )
    # 1 photo in chat 2
    await insert_media_item(
        db,
        make_media_item(
            message_id=10,
            chat_id=2,
            chat_name="OtherGroup",
            date="2026-03-10T10:00:00",
            caption="other photo",
            file_id=100,
            access_hash=1000,
        ),
    )
    # 1 video in chat 1
    await insert_media_item(
        db,
        make_media_item(
            message_id=20,
            chat_id=1,
            chat_name="TestGroup",
            date="2026-03-14T10:00:00",
            media_type="video",
            mime_type="video/mp4",
            file_size=5000000,
            width=1920,
            height=1080,
            duration=30.0,
            caption=None,
            file_id=200,
            access_hash=2000,
        ),
    )
    # 1 sync_state row
    await upsert_sync_state(db, chat_id=1, chat_name="TestGroup", active=True, last_msg_id=20)
    yield db


# ---------------------------------------------------------------------------
# FastAPI / ASGI fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def client():
    """httpx AsyncClient wired to the FastAPI app via ASGITransport."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest.fixture
def mock_tg():
    """AsyncMock of TelegramClientWrapper, injected via dependency_overrides."""
    tg = AsyncMock()
    app.dependency_overrides[get_tg] = lambda: tg
    yield tg
    app.dependency_overrides.pop(get_tg, None)


@pytest.fixture
def mock_db():
    """AsyncMock database injected via dependency_overrides (for tests that don't need real SQL)."""
    db = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db
    yield db
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
async def real_db_app(db):
    """Wire the in-memory db fixture into the FastAPI app for route tests needing real SQL."""
    app.dependency_overrides[get_db] = lambda: db
    yield db
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def mock_bg_tasks():
    """Empty set wired into dependency_overrides for background tasks."""
    bg_tasks: set = set()
    app.dependency_overrides[get_background_tasks] = lambda: bg_tasks
    yield bg_tasks
    app.dependency_overrides.pop(get_background_tasks, None)


@pytest.fixture
def mock_sync_status():
    """Empty dict wired into dependency_overrides for sync status."""
    status: dict = {}
    app.dependency_overrides[get_sync_status] = lambda: status
    yield status
    app.dependency_overrides.pop(get_sync_status, None)


@pytest.fixture
def mock_zip_jobs():
    """Empty dict wired into dependency_overrides for zip jobs."""
    jobs: dict = {}
    app.dependency_overrides[get_zip_jobs] = lambda: jobs
    yield jobs
    app.dependency_overrides.pop(get_zip_jobs, None)
