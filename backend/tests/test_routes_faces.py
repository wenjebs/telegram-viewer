"""Tests for backend/routes/faces.py endpoints."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

from database import (
    insert_media_item,
    insert_faces_batch,
    bulk_assign_persons,
    update_face_scan_state,
)
from helpers import make_media_item
from main import app
from utils import utc_now_iso


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_embedding() -> bytes:
    """Return a random 512-d float32 embedding as bytes."""
    return np.random.default_rng(42).standard_normal(512).astype(np.float32).tobytes()


async def _seed_person(db, *, name=None, face_count=2, media_id=1):
    """Insert a person with `face_count` faces linked to `media_id`. Returns person_id."""
    now = utc_now_iso()
    face_rows = [
        {
            "media_id": media_id,
            "embedding": _make_embedding(),
            "bbox_x": 0.1,
            "bbox_y": 0.1,
            "bbox_w": 0.2,
            "bbox_h": 0.2,
            "confidence": 0.9,
            "crop_path": f"/tmp/face_crop_{i}.jpg",
            "created_at": now,
        }
        for i in range(face_count)
    ]
    face_ids = await insert_faces_batch(db, face_rows)
    clusters = [{"face_ids": face_ids, "representative_face_id": face_ids[0]}]
    await bulk_assign_persons(db, clusters)
    await db.commit()
    # Get the person id
    cursor = await db.execute(
        "SELECT person_id FROM faces WHERE id = ?", (face_ids[0],)
    )
    row = await cursor.fetchone()
    person_id = row[0]
    if name:
        await db.execute(
            "UPDATE persons SET name = ? WHERE id = ?", (name, person_id)
        )
        await db.commit()
    return person_id


async def _seed_media(db, msg_id=1, chat_id=1):
    """Insert a photo media item and return its id."""
    await insert_media_item(
        db,
        make_media_item(
            message_id=msg_id,
            chat_id=chat_id,
            chat_name="TestGroup",
            date="2026-03-15T10:00:00",
        ),
    )
    cursor = await db.execute(
        "SELECT id FROM media_items WHERE message_id = ? AND chat_id = ?",
        (msg_id, chat_id),
    )
    row = await cursor.fetchone()
    return row[0]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def face_db(real_db_app, mock_tg, mock_bg_tasks):
    """In-memory DB wired into the app with mock tg and bg_tasks."""
    media_id = await _seed_media(real_db_app)
    yield real_db_app, media_id


# ---------------------------------------------------------------------------
# Scan status
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scan_status_idle(face_db):
    db, _ = face_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/faces/scan-status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "idle"
    assert data["scanned"] == 0
    assert data["total"] == 0
    assert data["person_count"] == 0


@pytest.mark.asyncio
async def test_scan_status_with_persons(face_db):
    db, media_id = face_db
    await _seed_person(db, media_id=media_id)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/faces/scan-status")
    assert resp.status_code == 200
    assert resp.json()["person_count"] == 1


# ---------------------------------------------------------------------------
# Start scan
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_scan_returns_started(face_db):
    db, _ = face_db
    with patch("routes.faces.scan_faces", new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/faces/scan")
        assert resp.status_code == 200
        assert resp.json()["started"] is True


@pytest.mark.asyncio
async def test_start_scan_already_running(face_db):
    db, _ = face_db
    # Set status to scanning and add a live task
    await update_face_scan_state(db, status="scanning")
    bg_tasks = app.dependency_overrides[
        __import__("deps", fromlist=["get_background_tasks"]).get_background_tasks
    ]()

    # Create a fake running task named face_scan
    async def _long():
        await asyncio.sleep(100)

    task = asyncio.create_task(_long())
    task.set_name("face_scan")
    bg_tasks.add(task)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/faces/scan")
        assert resp.status_code == 200
        assert resp.json()["started"] is False
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


@pytest.mark.asyncio
async def test_start_scan_stale_state_resets(face_db):
    db, _ = face_db
    # Status is scanning but no actual task running → stale
    await update_face_scan_state(db, status="scanning")
    with patch("routes.faces.scan_faces", new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/faces/scan")
        assert resp.status_code == 200
        assert resp.json()["started"] is True


# ---------------------------------------------------------------------------
# Persons CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_persons_empty(face_db):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/faces/persons")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_persons_returns_data(face_db):
    db, media_id = face_db
    await _seed_person(db, name="Alice", media_id=media_id)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/faces/persons")
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Alice"
    assert data[0]["display_name"] == "Alice"


@pytest.mark.asyncio
async def test_get_person_found(face_db):
    db, media_id = face_db
    pid = await _seed_person(db, name="Bob", media_id=media_id)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(f"/faces/persons/{pid}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Bob"


@pytest.mark.asyncio
async def test_get_person_404(face_db):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/faces/persons/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_rename_person(face_db):
    db, media_id = face_db
    pid = await _seed_person(db, name="OldName", media_id=media_id)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.patch(
            f"/faces/persons/{pid}", json={"name": "NewName"}
        )
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    # Verify in DB
    cursor = await db.execute("SELECT name FROM persons WHERE id = ?", (pid,))
    row = await cursor.fetchone()
    assert row[0] == "NewName"


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_merge_persons(face_db):
    db, media_id = face_db
    pid1 = await _seed_person(db, name="Keep", media_id=media_id)
    # Need another media for second person to avoid unique constraint
    media_id2 = await _seed_media(db, msg_id=2, chat_id=1)
    pid2 = await _seed_person(db, name="Merge", media_id=media_id2)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/faces/persons/merge",
            json={"keep_id": pid1, "merge_id": pid2},
        )
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    # Merged person should be gone
    cursor = await db.execute("SELECT id FROM persons WHERE id = ?", (pid2,))
    assert await cursor.fetchone() is None


@pytest.mark.asyncio
async def test_merge_batch(face_db):
    db, media_id = face_db
    pid1 = await _seed_person(db, name="Keep", media_id=media_id)
    media_id2 = await _seed_media(db, msg_id=3, chat_id=1)
    pid2 = await _seed_person(db, media_id=media_id2)
    media_id3 = await _seed_media(db, msg_id=4, chat_id=1)
    pid3 = await _seed_person(db, media_id=media_id3)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/faces/persons/merge-batch",
            json={"keep_id": pid1, "merge_ids": [pid2, pid3]},
        )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_merge_batch_self_merge_400(face_db):
    db, media_id = face_db
    pid1 = await _seed_person(db, media_id=media_id)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/faces/persons/merge-batch",
            json={"keep_id": pid1, "merge_ids": [pid1]},
        )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Similar groups
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_similar_groups_empty(face_db):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/faces/persons/similar-groups")
    assert resp.status_code == 200
    assert resp.json()["groups"] == []


@pytest.mark.asyncio
async def test_similar_groups_with_identical_embeddings(face_db):
    """Two persons with identical embeddings should be grouped together."""
    db, media_id = face_db
    now = utc_now_iso()
    emb = np.ones(512, dtype=np.float32).tobytes()

    # Create two persons each with identical embeddings
    for msg_offset in (10, 11):
        mid = await _seed_media(db, msg_id=msg_offset, chat_id=1)
        face_rows = [
            {
                "media_id": mid,
                "embedding": emb,
                "bbox_x": 0.1,
                "bbox_y": 0.1,
                "bbox_w": 0.2,
                "bbox_h": 0.2,
                "confidence": 0.9,
                "crop_path": None,
                "created_at": now,
            }
        ]
        fids = await insert_faces_batch(db, face_rows)
        await bulk_assign_persons(
            db, [{"face_ids": fids, "representative_face_id": fids[0]}]
        )
    await db.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/faces/persons/similar-groups?threshold=0.9")
    data = resp.json()
    assert len(data["groups"]) >= 1
    assert len(data["groups"][0]) >= 2


# ---------------------------------------------------------------------------
# Person media
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_person_media_pagination(face_db):
    db, media_id = face_db
    # Add more media items
    for i in range(5, 10):
        await _seed_media(db, msg_id=i, chat_id=1)

    # Seed a person with faces linked to different media
    now = utc_now_iso()
    cursor = await db.execute("SELECT id FROM media_items")
    all_media = [row[0] for row in await cursor.fetchall()]

    face_rows = []
    for mid in all_media:
        face_rows.append(
            {
                "media_id": mid,
                "embedding": _make_embedding(),
                "bbox_x": 0.1,
                "bbox_y": 0.1,
                "bbox_w": 0.2,
                "bbox_h": 0.2,
                "confidence": 0.9,
                "crop_path": None,
                "created_at": now,
            }
        )
    fids = await insert_faces_batch(db, face_rows)
    await bulk_assign_persons(
        db, [{"face_ids": fids, "representative_face_id": fids[0]}]
    )
    await db.commit()

    cursor = await db.execute("SELECT person_id FROM faces WHERE id = ?", (fids[0],))
    pid = (await cursor.fetchone())[0]

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(f"/faces/persons/{pid}/media?limit=2")
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["next_cursor"] is not None


# ---------------------------------------------------------------------------
# Face ops: remove face, get crop
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_remove_face(face_db):
    db, media_id = face_db
    pid = await _seed_person(db, media_id=media_id, face_count=3)
    cursor = await db.execute(
        "SELECT id FROM faces WHERE person_id = ? LIMIT 1", (pid,)
    )
    face_id = (await cursor.fetchone())[0]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.delete(f"/faces/persons/{pid}/faces/{face_id}")
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    # Verify face is unassigned
    cursor = await db.execute("SELECT person_id FROM faces WHERE id = ?", (face_id,))
    row = await cursor.fetchone()
    assert row[0] is None


@pytest.mark.asyncio
async def test_get_face_crop_file_exists(face_db, tmp_path):
    db, media_id = face_db
    now = utc_now_iso()
    # Create an actual temp file so FileResponse can stat it
    crop_file = tmp_path / "test_crop.jpg"
    crop_file.write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)  # minimal JPEG header

    face_rows = [
        {
            "media_id": media_id,
            "embedding": _make_embedding(),
            "bbox_x": 0.1,
            "bbox_y": 0.1,
            "bbox_w": 0.2,
            "bbox_h": 0.2,
            "confidence": 0.9,
            "crop_path": str(crop_file),
            "created_at": now,
        }
    ]
    fids = await insert_faces_batch(db, face_rows)
    await db.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(f"/faces/{fids[0]}/crop")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_face_crop_404_no_face(face_db):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/faces/99999/crop")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_face_crop_404_file_missing(face_db):
    db, media_id = face_db
    now = utc_now_iso()
    face_rows = [
        {
            "media_id": media_id,
            "embedding": _make_embedding(),
            "bbox_x": 0.1,
            "bbox_y": 0.1,
            "bbox_w": 0.2,
            "bbox_h": 0.2,
            "confidence": 0.9,
            "crop_path": "/nonexistent/path.jpg",
            "created_at": now,
        }
    ]
    fids = await insert_faces_batch(db, face_rows)
    await db.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(f"/faces/{fids[0]}/crop")
    assert resp.status_code == 404
    assert "missing" in resp.json()["detail"].lower()
