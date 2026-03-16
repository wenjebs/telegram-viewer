import pytest
from unittest.mock import patch
import aiosqlite
from httpx import AsyncClient, ASGITransport
from main import app
from database import init_db, insert_media_item


@pytest.fixture
async def seeded_db():
    db = await aiosqlite.connect(":memory:")
    await init_db(db)
    for i in range(3):
        await insert_media_item(
            db,
            {
                "message_id": i,
                "chat_id": 1,
                "chat_name": "TestGroup",
                "date": f"2026-03-{15 - i}T10:00:00",
                "media_type": "photo",
                "mime_type": "image/jpeg",
                "file_size": 50000,
                "width": 800,
                "height": 600,
                "duration": None,
                "caption": f"photo {i}",
                "file_id": i * 10,
                "access_hash": i * 100,
                "file_ref": b"ref",
                "thumbnail_path": None,
            },
        )
    yield db
    await db.close()


@pytest.mark.asyncio
async def test_list_media(seeded_db):
    with patch("routes.media.get_db", return_value=seeded_db):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/media?limit=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert "next_cursor" in data


@pytest.mark.asyncio
async def test_list_media_with_cursor(seeded_db):
    with patch("routes.media.get_db", return_value=seeded_db):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp1 = await client.get("/media?limit=2")
            cursor = resp1.json()["next_cursor"]
            resp2 = await client.get(f"/media?limit=2&cursor={cursor}")
    data2 = resp2.json()
    assert len(data2["items"]) == 1
    assert data2["next_cursor"] is None


@pytest.mark.asyncio
async def test_list_media_filter_type(seeded_db):
    # Add a video
    await insert_media_item(
        seeded_db,
        {
            "message_id": 99,
            "chat_id": 1,
            "chat_name": "TestGroup",
            "date": "2026-03-15T12:00:00",
            "media_type": "video",
            "mime_type": "video/mp4",
            "file_size": 5000000,
            "width": 1920,
            "height": 1080,
            "duration": 30.0,
            "caption": None,
            "file_id": 990,
            "access_hash": 9900,
            "file_ref": b"ref",
            "thumbnail_path": None,
        },
    )
    with patch("routes.media.get_db", return_value=seeded_db):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/media?type=video")
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["media_type"] == "video"
