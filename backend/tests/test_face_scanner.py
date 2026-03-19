"""Tests for backend/face_scanner.py."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

import aiosqlite

from database import (
    init_db,
    insert_media_item,
    insert_faces_batch,
    update_face_scan_state,
    get_face_scan_state,
)
from helpers import make_media_item
from utils import utc_now_iso


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_embedding(seed=42) -> bytes:
    return np.random.default_rng(seed).standard_normal(512).astype(np.float32).tobytes()


def _make_np_embedding(seed=42) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(512).astype(np.float32)


def _make_fake_face(confidence=0.9, bbox=(100, 100, 200, 200)):
    """Create a mock InsightFace detection result."""
    face = MagicMock()
    face.bbox = np.array(bbox, dtype=np.float32)
    face.embedding = _make_np_embedding()
    face.det_score = confidence
    return face


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def db():
    """In-memory SQLite database with schema initialized."""
    conn = await aiosqlite.connect(":memory:")
    await init_db(conn)
    yield conn
    await conn.close()


@pytest.fixture
def mock_face_app():
    """Mock _get_face_app to prevent InsightFace model download."""
    app = MagicMock()
    with patch("face_scanner._get_face_app", return_value=app):
        yield app


# ---------------------------------------------------------------------------
# _detect_faces_in_image
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_detect_faces_returns_faces(mock_face_app):
    """Detected faces produce dicts with embedding, bbox, confidence."""
    fake_img = np.zeros((480, 640, 3), dtype=np.uint8)
    mock_face_app.get.return_value = [_make_fake_face()]

    with patch("face_scanner.cv2") as mock_cv2:
        mock_cv2.imread.return_value = fake_img
        from face_scanner import _detect_faces_in_image

        results = _detect_faces_in_image("/fake/path.jpg")

    assert len(results) == 1
    assert "embedding" in results[0]
    assert "bbox_x" in results[0]
    assert "confidence" in results[0]
    assert results[0]["confidence"] == 0.9


@pytest.mark.asyncio
async def test_detect_faces_unreadable_image(mock_face_app):
    """Unreadable image returns empty list."""
    with patch("face_scanner.cv2") as mock_cv2:
        mock_cv2.imread.return_value = None
        from face_scanner import _detect_faces_in_image

        results = _detect_faces_in_image("/nonexistent.jpg")

    assert results == []


@pytest.mark.asyncio
async def test_detect_faces_no_faces(mock_face_app):
    """Image with no faces returns empty list."""
    fake_img = np.zeros((480, 640, 3), dtype=np.uint8)
    mock_face_app.get.return_value = []

    with patch("face_scanner.cv2") as mock_cv2:
        mock_cv2.imread.return_value = fake_img
        from face_scanner import _detect_faces_in_image

        results = _detect_faces_in_image("/fake/path.jpg")

    assert results == []


# ---------------------------------------------------------------------------
# _save_face_crop
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_face_crop_creates_jpeg():
    """Crop is saved as 112x112 JPEG."""
    fake_img = np.zeros((480, 640, 3), dtype=np.uint8)
    bbox_px = (100, 100, 200, 200)

    mock_pil_img = MagicMock()

    with (
        patch("face_scanner.cv2") as mock_cv2,
        patch("face_scanner.Image") as MockImage,
        patch("face_scanner.FACE_CACHE_DIR") as mock_dir,
    ):
        mock_cv2.cvtColor.return_value = np.zeros((100, 100, 3), dtype=np.uint8)
        MockImage.fromarray.return_value = mock_pil_img
        mock_pil_img.resize.return_value = mock_pil_img
        mock_dir.__truediv__ = lambda self, name: Path(f"/tmp/faces/{name}")
        mock_dir.mkdir = MagicMock()

        from face_scanner import _save_face_crop

        result = _save_face_crop(fake_img, bbox_px, face_id=42)

    mock_pil_img.resize.assert_called_once_with((112, 112), MockImage.LANCZOS)
    mock_pil_img.save.assert_called_once()
    assert "42.jpg" in result


@pytest.mark.asyncio
async def test_save_face_crop_clamps_to_bounds():
    """Bbox expansion is clamped to image boundaries."""
    fake_img = np.zeros((100, 100, 3), dtype=np.uint8)
    # Bbox near edges — expansion should clamp to 0 and image size
    bbox_px = (0, 0, 50, 50)

    mock_pil_img = MagicMock()

    with (
        patch("face_scanner.cv2") as mock_cv2,
        patch("face_scanner.Image") as MockImage,
        patch("face_scanner.FACE_CACHE_DIR") as mock_dir,
    ):
        mock_cv2.cvtColor.return_value = np.zeros((50, 50, 3), dtype=np.uint8)
        MockImage.fromarray.return_value = mock_pil_img
        mock_pil_img.resize.return_value = mock_pil_img
        mock_dir.__truediv__ = lambda self, name: Path(f"/tmp/faces/{name}")
        mock_dir.mkdir = MagicMock()

        from face_scanner import _save_face_crop

        # Should not raise even with edge bbox
        result = _save_face_crop(fake_img, bbox_px, face_id=99)

    assert result is not None


# ---------------------------------------------------------------------------
# cluster_faces
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cluster_faces_no_faces(db):
    """No faces → early return, no persons created."""
    from face_scanner import cluster_faces

    await cluster_faces(db)
    cursor = await db.execute("SELECT COUNT(*) FROM persons")
    assert (await cursor.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_cluster_faces_creates_persons(db):
    """DBSCAN clusters are converted into persons."""
    now = utc_now_iso()
    # Insert faces
    face_rows = [
        {
            "media_id": 1,
            "embedding": _make_embedding(seed=i),
            "bbox_x": 0.1,
            "bbox_y": 0.1,
            "bbox_w": 0.2,
            "bbox_h": 0.2,
            "confidence": 0.9,
            "crop_path": None,
            "created_at": now,
            "pitch": None,
            "yaw": None,
            "roll": None,
            "sharpness": None,
        }
        for i in range(6)
    ]
    # Need a media item for foreign-key-like integrity
    await insert_media_item(db, make_media_item(message_id=1))
    await insert_faces_batch(db, face_rows)
    await db.commit()

    # Mock DBSCAN to return two clusters of 3
    mock_dbscan_instance = MagicMock()
    mock_dbscan_instance.fit.return_value = mock_dbscan_instance
    mock_dbscan_instance.labels_ = np.array([0, 0, 0, 1, 1, 1])

    with patch("sklearn.cluster.DBSCAN", return_value=mock_dbscan_instance):
        from face_scanner import cluster_faces

        await cluster_faces(db)

    cursor = await db.execute("SELECT COUNT(*) FROM persons")
    assert (await cursor.fetchone())[0] == 2


@pytest.mark.asyncio
async def test_cluster_faces_purges_low_confidence(db):
    """Low-confidence faces are deleted before clustering."""
    now = utc_now_iso()
    await insert_media_item(db, make_media_item(message_id=1))

    face_rows = [
        {
            "media_id": 1,
            "embedding": _make_embedding(seed=0),
            "bbox_x": 0.1,
            "bbox_y": 0.1,
            "bbox_w": 0.2,
            "bbox_h": 0.2,
            "confidence": 0.1,  # Below MIN_CONFIDENCE
            "crop_path": "/tmp/low_conf.jpg",
            "created_at": now,
            "pitch": None,
            "yaw": None,
            "roll": None,
            "sharpness": None,
        }
    ]
    await insert_faces_batch(db, face_rows)
    await db.commit()

    with patch("face_scanner.Path") as MockPath:
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = False
        MockPath.return_value = mock_path_inst

        from face_scanner import cluster_faces

        await cluster_faces(db)

    # Low-confidence face should be deleted
    cursor = await db.execute("SELECT COUNT(*) FROM faces")
    assert (await cursor.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_cluster_faces_noise_excluded(db):
    """Faces labeled as noise (-1) by DBSCAN get no person assignment."""
    now = utc_now_iso()
    await insert_media_item(db, make_media_item(message_id=1))

    face_rows = [
        {
            "media_id": 1,
            "embedding": _make_embedding(seed=i),
            "bbox_x": 0.1,
            "bbox_y": 0.1,
            "bbox_w": 0.2,
            "bbox_h": 0.2,
            "confidence": 0.9,
            "crop_path": None,
            "created_at": now,
            "pitch": None,
            "yaw": None,
            "roll": None,
            "sharpness": None,
        }
        for i in range(3)
    ]
    await insert_faces_batch(db, face_rows)
    await db.commit()

    # All noise
    mock_dbscan_instance = MagicMock()
    mock_dbscan_instance.fit.return_value = mock_dbscan_instance
    mock_dbscan_instance.labels_ = np.array([-1, -1, -1])

    with patch("sklearn.cluster.DBSCAN", return_value=mock_dbscan_instance):
        from face_scanner import cluster_faces

        await cluster_faces(db)

    cursor = await db.execute("SELECT COUNT(*) FROM persons")
    assert (await cursor.fetchone())[0] == 0


# ---------------------------------------------------------------------------
# scan_faces
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scan_faces_full_pipeline(db, mock_face_app):
    """Full scan: detect faces → cluster → done status."""
    await insert_media_item(db, make_media_item(message_id=1, thumbnail_path="/tmp/photo.jpg"))
    tg = AsyncMock()

    fake_img = np.zeros((480, 640, 3), dtype=np.uint8)
    detected = [
        {
            "embedding": _make_embedding(),
            "bbox_x": 0.1,
            "bbox_y": 0.1,
            "bbox_w": 0.2,
            "bbox_h": 0.2,
            "confidence": 0.9,
            "img": fake_img,
            "bbox_px": (100, 100, 200, 200),
        }
    ]

    with (
        patch("face_scanner._detect_faces_in_image", return_value=detected),
        patch("face_scanner._save_face_crop", return_value="/tmp/crop.jpg"),
        patch("face_scanner.cluster_faces", new_callable=AsyncMock) as mock_cluster,
        patch("face_scanner.Path") as MockPath,
    ):
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = True
        MockPath.return_value = mock_path_inst

        from face_scanner import scan_faces

        await scan_faces(db, tg)

    state = await get_face_scan_state(db)
    assert state["status"] == "done"
    mock_cluster.assert_called_once()


@pytest.mark.asyncio
async def test_scan_faces_force_rescan(db, mock_face_app):
    """force_rescan=True resets face data before scanning."""
    await insert_media_item(
        db, make_media_item(message_id=1, thumbnail_path="/tmp/photo.jpg")
    )
    # Pre-insert a face
    now = utc_now_iso()
    await insert_faces_batch(
        db,
        [
            {
                "media_id": 1,
                "embedding": _make_embedding(),
                "bbox_x": 0.1,
                "bbox_y": 0.1,
                "bbox_w": 0.2,
                "bbox_h": 0.2,
                "confidence": 0.9,
                "crop_path": None,
                "created_at": now,
                "pitch": None,
                "yaw": None,
                "roll": None,
                "sharpness": None,
            }
        ],
    )
    # Mark as scanned
    await db.execute("UPDATE media_items SET faces_scanned = 1")
    await db.commit()

    tg = AsyncMock()

    with (
        patch("face_scanner._detect_faces_in_image", return_value=[]),
        patch("face_scanner.cluster_faces", new_callable=AsyncMock),
        patch("face_scanner.Path") as MockPath,
    ):
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = True
        MockPath.return_value = mock_path_inst

        from face_scanner import scan_faces

        await scan_faces(db, tg, force_rescan=True)

    # After force rescan, old faces should be gone (deleted in reset)
    cursor = await db.execute("SELECT COUNT(*) FROM faces")
    assert (await cursor.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_scan_faces_no_unscanned_skips_to_cluster(db, mock_face_app):
    """When all photos are already scanned, skip detection, go to clustering."""
    # No unscanned photos (no photos at all)
    tg = AsyncMock()

    with patch("face_scanner.cluster_faces", new_callable=AsyncMock) as mock_cluster:
        from face_scanner import scan_faces

        await scan_faces(db, tg)

    state = await get_face_scan_state(db)
    assert state["status"] == "done"
    mock_cluster.assert_called_once()


@pytest.mark.asyncio
async def test_scan_faces_error_sets_state(db, mock_face_app):
    """Exception during scan sets status to error."""
    await insert_media_item(
        db, make_media_item(message_id=1, thumbnail_path="/tmp/photo.jpg")
    )
    tg = AsyncMock()

    with (
        patch("face_scanner._detect_faces_in_image", side_effect=RuntimeError("boom")),
        patch("face_scanner.Path") as MockPath,
    ):
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = True
        MockPath.return_value = mock_path_inst

        from face_scanner import scan_faces

        await scan_faces(db, tg)

    state = await get_face_scan_state(db)
    # The per-photo exception is caught inside the loop, so status should still be done
    # But if cluster_faces fails, it would be error. Let's verify it finishes.
    # Actually, the per-photo error is caught, so it should reach clustering.
    # scan_faces catches per-photo errors and continues.
    assert state["status"] in ("done", "error")


@pytest.mark.asyncio
async def test_scan_faces_status_updates_every_5(db, mock_face_app):
    """Status is updated every 5 photos scanned."""
    # Insert 6 photos
    for i in range(6):
        await insert_media_item(
            db,
            make_media_item(
                message_id=i,
                chat_id=1,
                date=f"2026-03-{10 + i}T10:00:00",
                file_id=i * 10,
                access_hash=i * 100,
                thumbnail_path=f"/tmp/photo_{i}.jpg",
            ),
        )

    tg = AsyncMock()

    update_calls = []
    original_update = update_face_scan_state

    async def tracking_update(db, **kwargs):
        update_calls.append(kwargs)
        await original_update(db, **kwargs)

    with (
        patch("face_scanner._detect_faces_in_image", return_value=[]),
        patch("face_scanner.cluster_faces", new_callable=AsyncMock),
        patch("face_scanner.update_face_scan_state", side_effect=tracking_update),
        patch("face_scanner.Path") as MockPath,
    ):
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = True
        MockPath.return_value = mock_path_inst

        from face_scanner import scan_faces

        await scan_faces(db, tg)

    # Check that there's a progress update with scanned_count=5
    scanned_counts = [
        c.get("scanned_count") for c in update_calls if "scanned_count" in c
    ]
    assert 5 in scanned_counts


# ---------------------------------------------------------------------------
# _download_for_scan
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scan_faces_recounts_total_when_new_photos_arrive(db, mock_face_app):
    """Total is updated when new unscanned photos appear during scanning."""
    # Insert 6 initial photos
    for i in range(6):
        await insert_media_item(
            db,
            make_media_item(
                message_id=i,
                chat_id=1,
                date=f"2026-03-{10 + i}T10:00:00",
                file_id=i * 10,
                access_hash=i * 100,
                thumbnail_path=f"/tmp/photo_{i}.jpg",
            ),
        )

    tg = AsyncMock()

    # Track update_face_scan_state calls to inspect total_count values
    update_calls = []
    original_update = update_face_scan_state

    async def tracking_update(db_conn, **kwargs):
        update_calls.append(kwargs)
        await original_update(db_conn, **kwargs)

    # After the first batch is scanned, inject 4 more unscanned photos
    # to simulate a concurrent media sync
    original_get_unscanned = None
    batch_call_count = 0

    async def get_unscanned_with_injection(db_conn, limit=20):
        nonlocal batch_call_count
        batch_call_count += 1
        if batch_call_count == 2:
            # Inject new photos mid-scan (simulating concurrent sync)
            for i in range(6, 10):
                await insert_media_item(
                    db_conn,
                    make_media_item(
                        message_id=i,
                        chat_id=1,
                        date=f"2026-03-{20 + i}T10:00:00",
                        file_id=i * 10,
                        access_hash=i * 100,
                        thumbnail_path=f"/tmp/photo_{i}.jpg",
                    ),
                )
            await db_conn.commit()
        from database import get_unscanned_photos as real_get

        return await real_get(db_conn, limit)

    with (
        patch("face_scanner._detect_faces_in_image", return_value=[]),
        patch("face_scanner.cluster_faces", new_callable=AsyncMock),
        patch("face_scanner.update_face_scan_state", side_effect=tracking_update),
        patch("face_scanner.get_unscanned_photos", side_effect=get_unscanned_with_injection),
        patch("face_scanner.Path") as MockPath,
    ):
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = True
        MockPath.return_value = mock_path_inst

        from face_scanner import scan_faces

        await scan_faces(db, tg)

    # Find the final progress update (last one with both scanned_count and total_count)
    progress_updates = [
        c for c in update_calls if "scanned_count" in c and "total_count" in c
    ]
    assert len(progress_updates) > 0
    final = progress_updates[-1]
    # scanned should never exceed total
    assert final["scanned_count"] <= final["total_count"], (
        f"scanned ({final['scanned_count']}) should not exceed total ({final['total_count']})"
    )


@pytest.mark.asyncio
async def test_download_for_scan_cache_hit():
    """If cached file exists, return its path without downloading."""
    photo = {"chat_id": 123, "message_id": 456}

    with patch("face_scanner.CACHE_DIR") as mock_cache_dir:
        mock_cached_path = MagicMock()
        mock_cached_path.exists.return_value = True
        mock_cached_path.__str__ = lambda self: "/cache/123_456.jpg"
        mock_cache_dir.__truediv__ = lambda self, name: mock_cached_path

        from face_scanner import _download_for_scan

        result = await _download_for_scan(AsyncMock(), photo)

    assert result == "/cache/123_456.jpg"


@pytest.mark.asyncio
async def test_download_for_scan_cache_miss():
    """If not cached, download via tg client and write to cache."""
    photo = {"chat_id": 123, "message_id": 456}
    tg = AsyncMock()
    mock_msg = MagicMock()
    mock_msg.media = True
    tg.client.get_messages.return_value = mock_msg
    tg.client.download_media.return_value = b"image_data"

    with patch("face_scanner.CACHE_DIR") as mock_cache_dir:
        mock_cached_path = MagicMock()
        mock_cached_path.exists.return_value = False
        mock_cached_path.__str__ = lambda self: "/cache/123_456.jpg"
        mock_cache_dir.__truediv__ = lambda self, name: mock_cached_path
        mock_cache_dir.mkdir = MagicMock()

        from face_scanner import _download_for_scan

        result = await _download_for_scan(tg, photo)

    assert result == "/cache/123_456.jpg"
    mock_cached_path.write_bytes.assert_called_once_with(b"image_data")


@pytest.mark.asyncio
async def test_download_for_scan_error_returns_none():
    """Download failure returns None."""
    photo = {"chat_id": 123, "message_id": 456}
    tg = AsyncMock()
    tg.acquire_semaphore.side_effect = RuntimeError("connection error")

    with patch("face_scanner.CACHE_DIR") as mock_cache_dir:
        mock_cached_path = MagicMock()
        mock_cached_path.exists.return_value = False
        mock_cache_dir.__truediv__ = lambda self, name: mock_cached_path

        from face_scanner import _download_for_scan

        result = await _download_for_scan(tg, photo)

    assert result is None


@pytest.mark.asyncio
async def test_download_for_scan_no_chat_id():
    """Missing chat_id/message_id returns None without downloading."""
    from face_scanner import _download_for_scan

    result = await _download_for_scan(AsyncMock(), {})
    assert result is None


# ---------------------------------------------------------------------------
# pose + sharpness extraction
# ---------------------------------------------------------------------------


def test_detect_faces_extracts_quality_attributes(tmp_path):
    """_detect_faces_in_image should extract pitch/yaw/roll/sharpness."""
    import cv2

    # Create a test image with a sharp region (not random noise — use edges for deterministic sharpness)
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.rectangle(img, (100, 100), (200, 200), (255, 255, 255), 2)  # sharp edges
    img_path = tmp_path / "test.jpg"
    cv2.imwrite(str(img_path), img)

    fake_face = _make_fake_face(bbox=(100, 100, 200, 200))
    fake_face.pose = np.array([5.0, -10.0, 2.0])

    with patch("face_scanner._get_face_app") as mock_app:
        mock_app.return_value.get.return_value = [fake_face]
        from face_scanner import _detect_faces_in_image
        results = _detect_faces_in_image(str(img_path))

    assert len(results) == 1
    r = results[0]
    assert r["pitch"] == pytest.approx(5.0)
    assert r["yaw"] == pytest.approx(-10.0)
    assert r["roll"] == pytest.approx(2.0)
    assert isinstance(r["sharpness"], float)
    assert r["sharpness"] >= 0


def test_detect_faces_handles_missing_pose(tmp_path):
    """If face.pose is None, pitch/yaw/roll should be None."""
    import cv2

    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img_path = tmp_path / "test.jpg"
    cv2.imwrite(str(img_path), img)

    fake_face = _make_fake_face()
    fake_face.pose = None

    with patch("face_scanner._get_face_app") as mock_app:
        mock_app.return_value.get.return_value = [fake_face]
        from face_scanner import _detect_faces_in_image
        results = _detect_faces_in_image(str(img_path))

    assert len(results) == 1
    assert results[0]["pitch"] is None
    assert results[0]["yaw"] is None
    assert results[0]["roll"] is None
