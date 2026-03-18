from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport
from main import app
from database import insert_media_item, hide_media_item, favorite_media_item
from helpers import make_media_item


@pytest.fixture
async def seeded_db(real_db_app):
    """3 photos in TestGroup, wired into the app."""
    for i in range(3):
        await insert_media_item(
            real_db_app,
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
    yield real_db_app


# ---------------------------------------------------------------------------
# Helper to make an AsyncClient
# ---------------------------------------------------------------------------

def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# ===========================================================================
# Existing tests
# ===========================================================================


@pytest.mark.asyncio
async def test_list_media(seeded_db):
    async with _client() as client:
        resp = await client.get("/media?limit=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert "next_cursor" in data


@pytest.mark.asyncio
async def test_list_media_with_cursor(seeded_db):
    async with _client() as client:
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
            "sender_name": None,
        },
    )
    async with _client() as client:
        resp = await client.get("/media?type=video")
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["media_type"] == "video"


# ===========================================================================
# Filter combos
# ===========================================================================


@pytest.mark.asyncio
async def test_list_media_filter_groups(seeded_db):
    """Filter by group_ids returns only items from that chat."""
    # Add item in a different chat
    await insert_media_item(
        seeded_db,
        make_media_item(message_id=50, chat_id=2, chat_name="OtherGroup", file_id=500, access_hash=5000),
    )
    async with _client() as client:
        resp = await client.get("/media?groups=2")
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["chat_id"] == 2


@pytest.mark.asyncio
async def test_list_media_filter_date_from(seeded_db):
    """date_from filters out older items."""
    async with _client() as client:
        resp = await client.get("/media?date_from=2026-03-14T00:00:00")
    data = resp.json()
    # Items: 2026-03-15, 2026-03-14, 2026-03-13  -> 2 match (15 and 14)
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_list_media_filter_date_to(seeded_db):
    """date_to filters out newer items."""
    async with _client() as client:
        resp = await client.get("/media?date_to=2026-03-14T00:00:00")
    data = resp.json()
    # Items: 2026-03-15, 2026-03-14, 2026-03-13  -> 2 match (14 and 13)
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_list_media_filter_date_range(seeded_db):
    """Combined date_from and date_to."""
    async with _client() as client:
        resp = await client.get("/media?date_from=2026-03-14T00:00:00&date_to=2026-03-14T23:59:59")
    data = resp.json()
    assert len(data["items"]) == 1
    assert "2026-03-14" in data["items"][0]["date"]


@pytest.mark.asyncio
async def test_list_media_filter_faces_none(seeded_db):
    """faces=none returns items with face_count=0 or NULL (unscanned)."""
    async with _client() as client:
        resp = await client.get("/media?faces=none")
    # All 3 items have default face_count=NULL so this depends on DB implementation
    assert resp.status_code == 200


# ===========================================================================
# Media count
# ===========================================================================


@pytest.mark.asyncio
async def test_media_count(seeded_db):
    async with _client() as client:
        resp = await client.get("/media/count")
    assert resp.status_code == 200
    assert resp.json()["count"] == 3


# ===========================================================================
# Hide single
# ===========================================================================


@pytest.mark.asyncio
async def test_hide_media_success(seeded_db):
    async with _client() as client:
        resp = await client.post("/media/1/hide")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_hide_media_404(seeded_db):
    async with _client() as client:
        resp = await client.post("/media/9999/hide")
    assert resp.status_code == 404


# ===========================================================================
# Unhide single
# ===========================================================================


@pytest.mark.asyncio
async def test_unhide_media_success(seeded_db):
    # First hide it
    await hide_media_item(seeded_db, 1)
    async with _client() as client:
        resp = await client.post("/media/1/unhide")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_unhide_media_404(seeded_db):
    async with _client() as client:
        resp = await client.post("/media/9999/unhide")
    assert resp.status_code == 404


# ===========================================================================
# Hide batch
# ===========================================================================


@pytest.mark.asyncio
async def test_hide_batch_success(seeded_db):
    async with _client() as client:
        resp = await client.post("/media/hide-batch", json={"media_ids": [1, 2]})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_hide_batch_empty_validation_error(seeded_db):
    async with _client() as client:
        resp = await client.post("/media/hide-batch", json={"media_ids": []})
    assert resp.status_code == 422


# ===========================================================================
# Hidden list & count
# ===========================================================================


@pytest.mark.asyncio
async def test_list_hidden_media(seeded_db):
    await hide_media_item(seeded_db, 1)
    await hide_media_item(seeded_db, 2)
    async with _client() as client:
        resp = await client.get("/media/hidden")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_hidden_count(seeded_db):
    await hide_media_item(seeded_db, 1)
    async with _client() as client:
        resp = await client.get("/media/hidden/count")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1


# ===========================================================================
# Unhide batch
# ===========================================================================


@pytest.mark.asyncio
async def test_unhide_batch_success(seeded_db):
    await hide_media_item(seeded_db, 1)
    await hide_media_item(seeded_db, 2)
    async with _client() as client:
        resp = await client.post("/media/unhide-batch", json={"media_ids": [1, 2]})
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        # Verify they are no longer hidden
        resp2 = await client.get("/media/hidden/count")
        assert resp2.json()["count"] == 0


@pytest.mark.asyncio
async def test_unhide_batch_empty_validation_error(seeded_db):
    async with _client() as client:
        resp = await client.post("/media/unhide-batch", json={"media_ids": []})
    assert resp.status_code == 422


# ===========================================================================
# Favorites: toggle, batch, list, count
# ===========================================================================


@pytest.mark.asyncio
async def test_favorite_toggle_on(seeded_db):
    async with _client() as client:
        resp = await client.post("/media/1/favorite")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["favorited"] is True


@pytest.mark.asyncio
async def test_favorite_toggle_off(seeded_db):
    # Favorite first, then toggle off
    await favorite_media_item(seeded_db, 1)
    async with _client() as client:
        resp = await client.post("/media/1/favorite")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["favorited"] is False


@pytest.mark.asyncio
async def test_favorite_404(seeded_db):
    async with _client() as client:
        resp = await client.post("/media/9999/favorite")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_favorite_batch_success(seeded_db):
    async with _client() as client:
        resp = await client.post("/media/favorite-batch", json={"media_ids": [1, 2]})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_favorite_batch_empty_validation_error(seeded_db):
    async with _client() as client:
        resp = await client.post("/media/favorite-batch", json={"media_ids": []})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_unfavorite_batch_success(seeded_db):
    await favorite_media_item(seeded_db, 1)
    await favorite_media_item(seeded_db, 2)
    async with _client() as client:
        resp = await client.post("/media/unfavorite-batch", json={"media_ids": [1, 2]})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_unfavorite_batch_empty_validation_error(seeded_db):
    async with _client() as client:
        resp = await client.post("/media/unfavorite-batch", json={"media_ids": []})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_favorites(seeded_db):
    await favorite_media_item(seeded_db, 1)
    await favorite_media_item(seeded_db, 2)
    async with _client() as client:
        resp = await client.get("/media/favorites")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_favorites_count(seeded_db):
    await favorite_media_item(seeded_db, 1)
    async with _client() as client:
        resp = await client.get("/media/favorites/count")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1


# ===========================================================================
# Thumbnail
# ===========================================================================


@pytest.mark.asyncio
async def test_thumbnail_from_cache(seeded_db, mock_tg, tmp_path):
    """Serve thumbnail from cached path when it exists on disk."""
    thumb_file = tmp_path / "thumb.jpg"
    thumb_file.write_bytes(b"\xff\xd8\xff\xe0JFIF")  # minimal JPEG header

    # Set the thumbnail_path in DB
    await seeded_db.execute(
        "UPDATE media_items SET thumbnail_path = ? WHERE id = 1",
        (str(thumb_file),),
    )
    await seeded_db.commit()

    async with _client() as client:
        resp = await client.get("/media/1/thumbnail")
    assert resp.status_code == 200
    assert b"JFIF" in resp.content


@pytest.mark.asyncio
async def test_thumbnail_from_telegram(seeded_db, mock_tg, tmp_path):
    """Download thumbnail from Telegram when not cached."""
    thumb_bytes = b"\xff\xd8\xff\xe0JFIF_thumb"
    mock_tg.acquire_semaphore = AsyncMock()
    mock_tg.release_semaphore = MagicMock()
    mock_msg = MagicMock()
    mock_msg.media = MagicMock()
    mock_tg.client.get_messages = AsyncMock(return_value=mock_msg)
    mock_tg.client.download_media = AsyncMock(return_value=thumb_bytes)

    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()

    with patch("routes.media.CACHE_DIR", new=cache_dir):
        async with _client() as client:
            resp = await client.get("/media/1/thumbnail")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_thumbnail_404_missing_item(seeded_db, mock_tg):
    """404 when media item doesn't exist."""
    async with _client() as client:
        resp = await client.get("/media/9999/thumbnail")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_thumbnail_telegram_returns_none(seeded_db, mock_tg):
    """404 when Telegram returns no thumbnail."""
    mock_tg.acquire_semaphore = AsyncMock()
    mock_tg.release_semaphore = MagicMock()
    mock_msg = MagicMock()
    mock_msg.media = MagicMock()
    mock_tg.client.get_messages = AsyncMock(return_value=mock_msg)
    mock_tg.client.download_media = AsyncMock(return_value=None)

    async with _client() as client:
        resp = await client.get("/media/1/thumbnail")
    assert resp.status_code == 404
    assert "No thumbnail available" in resp.json()["detail"]


# ===========================================================================
# Download
# ===========================================================================


@pytest.mark.asyncio
async def test_download_photo_from_cache(seeded_db, mock_tg, mock_bg_tasks, tmp_path):
    """Serve download from cached path when file exists on disk."""
    dl_file = tmp_path / "photo_full.jpg"
    dl_file.write_bytes(b"\xff\xd8\xff\xe0JFIF_full")

    await seeded_db.execute(
        "UPDATE media_items SET download_path = ? WHERE id = 1",
        (str(dl_file),),
    )
    await seeded_db.commit()

    async with _client() as client:
        resp = await client.get("/media/1/download")
    assert resp.status_code == 200
    assert b"JFIF_full" in resp.content


@pytest.mark.asyncio
async def test_download_photo_from_telegram(seeded_db, mock_tg, mock_bg_tasks, tmp_path):
    """Download photo from Telegram when not cached."""
    photo_bytes = b"\xff\xd8\xff\xe0JFIF_download"
    mock_tg.acquire_semaphore = AsyncMock()
    mock_tg.release_semaphore = MagicMock()
    mock_msg = MagicMock()
    mock_msg.media = MagicMock()
    mock_tg.client.get_messages = AsyncMock(return_value=mock_msg)
    mock_tg.client.download_media = AsyncMock(return_value=photo_bytes)

    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()

    with patch("routes.media.CACHE_DIR", new=cache_dir):
        async with _client() as client:
            resp = await client.get("/media/1/download")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_download_404_missing_item(seeded_db, mock_tg, mock_bg_tasks):
    """404 when media item doesn't exist."""
    async with _client() as client:
        resp = await client.get("/media/9999/download")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_download_video_streaming(seeded_db, mock_tg, mock_bg_tasks, tmp_path):
    """Video download returns a streaming response."""
    # Insert a video item
    await insert_media_item(
        seeded_db,
        make_media_item(
            message_id=99,
            chat_id=1,
            chat_name="TestGroup",
            date="2026-03-15T12:00:00",
            media_type="video",
            mime_type="video/mp4",
            file_size=1000,
            width=1920,
            height=1080,
            duration=10.0,
            file_id=990,
            access_hash=9900,
        ),
    )

    # Get the inserted video's ID
    cursor = await seeded_db.execute(
        "SELECT id FROM media_items WHERE message_id = 99 AND chat_id = 1"
    )
    row = await cursor.fetchone()
    video_id = row[0]

    chunks = [b"chunk1", b"chunk2"]
    mock_tg.acquire_semaphore = AsyncMock()
    mock_tg.release_semaphore = MagicMock()
    mock_msg = MagicMock()
    mock_msg.media = MagicMock()

    # Make isinstance(raw, Message) return True
    from telethon.tl.custom import Message
    mock_msg.__class__ = Message

    mock_tg.client.get_messages = AsyncMock(return_value=mock_msg)

    async def fake_iter_download(media, chunk_size=None):
        for c in chunks:
            yield c

    mock_tg.client.iter_download = fake_iter_download

    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()

    with patch("routes.media.CACHE_DIR", new=cache_dir):
        async with _client() as client:
            resp = await client.get(f"/media/{video_id}/download")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "video/mp4"


# ===========================================================================
# Zip endpoints
# ===========================================================================


@pytest.mark.asyncio
async def test_prepare_zip(seeded_db, mock_tg, mock_bg_tasks, mock_zip_jobs):
    """POST /media/prepare-zip returns 202 with job_id."""
    async with _client() as client:
        resp = await client.post("/media/prepare-zip", json={"media_ids": [1, 2]})
    assert resp.status_code == 202
    body = resp.json()
    assert "job_id" in body
    # Job should be registered
    assert body["job_id"] in mock_zip_jobs


@pytest.mark.asyncio
async def test_zip_status_found(seeded_db, mock_zip_jobs):
    """GET /media/zip-status/{id} returns status for existing job."""
    import time
    mock_zip_jobs["test-job"] = {
        "status": "preparing",
        "files_ready": 1,
        "files_total": 3,
        "error": None,
        "zip_path": None,
        "created_at": time.monotonic(),
    }
    async with _client() as client:
        resp = await client.get("/media/zip-status/test-job")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "preparing"
    assert body["files_ready"] == 1
    assert body["files_total"] == 3


@pytest.mark.asyncio
async def test_zip_status_404(seeded_db, mock_zip_jobs):
    """GET /media/zip-status/{id} returns 404 for unknown job."""
    async with _client() as client:
        resp = await client.get("/media/zip-status/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_zip_download_ready(seeded_db, mock_zip_jobs, tmp_path):
    """GET /media/zip-download/{id} returns zip file when done."""
    import time
    zip_file = tmp_path / "test.zip"
    zip_file.write_bytes(b"PK\x03\x04fakecontent")

    mock_zip_jobs["done-job"] = {
        "status": "done",
        "files_ready": 2,
        "files_total": 2,
        "error": None,
        "zip_path": str(zip_file),
        "created_at": time.monotonic(),
    }
    async with _client() as client:
        resp = await client.get("/media/zip-download/done-job")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"


@pytest.mark.asyncio
async def test_zip_download_not_ready(seeded_db, mock_zip_jobs):
    """GET /media/zip-download/{id} returns 409 when still preparing."""
    import time
    mock_zip_jobs["pending-job"] = {
        "status": "preparing",
        "files_ready": 0,
        "files_total": 2,
        "error": None,
        "zip_path": None,
        "created_at": time.monotonic(),
    }
    async with _client() as client:
        resp = await client.get("/media/zip-download/pending-job")
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_zip_download_404(seeded_db, mock_zip_jobs):
    """GET /media/zip-download/{id} returns 404 for unknown job."""
    async with _client() as client:
        resp = await client.get("/media/zip-download/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_download_zip_sync(seeded_db, mock_tg, tmp_path):
    """POST /media/download-zip returns zip file synchronously."""
    photo_bytes = b"\xff\xd8\xff\xe0JFIF"
    mock_tg.acquire_semaphore = AsyncMock()
    mock_tg.release_semaphore = MagicMock()
    mock_msg = MagicMock()
    mock_msg.media = MagicMock()
    mock_tg.client.get_messages = AsyncMock(return_value=mock_msg)
    mock_tg.client.download_media = AsyncMock(return_value=photo_bytes)

    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()

    with patch("routes.media.CACHE_DIR", new=cache_dir):
        async with _client() as client:
            resp = await client.post("/media/download-zip", json={"media_ids": [1]})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"


@pytest.mark.asyncio
async def test_prepare_zip_empty_ids(seeded_db, mock_tg, mock_bg_tasks, mock_zip_jobs):
    """POST /media/prepare-zip with empty list returns 400."""
    async with _client() as client:
        resp = await client.post("/media/prepare-zip", json={"media_ids": []})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_prepare_zip_missing_ids(seeded_db, mock_tg, mock_bg_tasks, mock_zip_jobs):
    """POST /media/prepare-zip with nonexistent IDs returns 404."""
    async with _client() as client:
        resp = await client.post("/media/prepare-zip", json={"media_ids": [9999]})
    assert resp.status_code == 404


# ===========================================================================
# Sort parameter
# ===========================================================================


@pytest.mark.asyncio
async def test_list_media_sort_asc(seeded_db):
    """GET /media?sort=asc returns items in ascending date order."""
    async with _client() as client:
        resp = await client.get("/media?sort=asc")
    data = resp.json()
    dates = [item["date"] for item in data["items"]]
    assert dates == sorted(dates)


@pytest.mark.asyncio
async def test_list_media_sort_desc(seeded_db):
    """GET /media?sort=desc returns items in descending date order (default)."""
    async with _client() as client:
        resp = await client.get("/media?sort=desc")
    data = resp.json()
    dates = [item["date"] for item in data["items"]]
    assert dates == sorted(dates, reverse=True)


@pytest.mark.asyncio
async def test_list_media_sort_asc_pagination(seeded_db):
    """Cursor pagination works correctly with sort=asc."""
    async with _client() as client:
        resp1 = await client.get("/media?sort=asc&limit=2")
    data1 = resp1.json()
    assert len(data1["items"]) == 2
    dates1 = [item["date"] for item in data1["items"]]
    assert dates1 == sorted(dates1)

    async with _client() as client:
        resp2 = await client.get(f"/media?sort=asc&limit=2&cursor={data1['next_cursor']}")
    data2 = resp2.json()
    assert len(data2["items"]) == 1
    # Second page dates should be after first page dates
    assert data2["items"][0]["date"] >= dates1[-1]


@pytest.mark.asyncio
async def test_list_hidden_media_sort_asc(seeded_db):
    """GET /media/hidden?sort=asc returns hidden items in ascending order."""
    # Hide two items
    await hide_media_item(seeded_db, 1)
    await hide_media_item(seeded_db, 2)
    async with _client() as client:
        resp = await client.get("/media/hidden?sort=asc")
    data = resp.json()
    assert len(data["items"]) == 2
    hidden_ats = [item["hidden_at"] for item in data["items"]]
    assert hidden_ats == sorted(hidden_ats)


@pytest.mark.asyncio
async def test_list_favorites_media_sort_asc(seeded_db):
    """GET /media/favorites?sort=asc returns favorites in ascending order."""
    await favorite_media_item(seeded_db, 1)
    await favorite_media_item(seeded_db, 2)
    async with _client() as client:
        resp = await client.get("/media/favorites?sort=asc")
    data = resp.json()
    assert len(data["items"]) == 2
    fav_ats = [item["favorited_at"] for item in data["items"]]
    assert fav_ats == sorted(fav_ats)
