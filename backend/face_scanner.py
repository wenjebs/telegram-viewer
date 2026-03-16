from __future__ import annotations

import asyncio
import io
import logging
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from database import (
    bulk_assign_persons,
    clear_person_assignments,
    get_all_face_embeddings,
    get_unscanned_photo_count,
    insert_faces_batch,
    mark_media_scanned,
    get_unscanned_photos,
    update_face_scan_state,
)

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent / "cache"
FACE_CACHE_DIR = CACHE_DIR / "faces"

_face_app = None


def _get_face_app():
    global _face_app
    if _face_app is None:
        from insightface.app import FaceAnalysis

        _face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        _face_app.prepare(ctx_id=0, det_size=(640, 640))
    return _face_app


def _detect_faces_in_image(img_path: str) -> list[dict]:
    """Detect faces in an image. CPU-bound, call via asyncio.to_thread()."""
    img = cv2.imread(img_path)
    if img is None:
        logger.warning("Could not read image: %s", img_path)
        return []

    h, w = img.shape[:2]
    faces = _get_face_app().get(img)
    results = []
    for face in faces:
        x1, y1, x2, y2 = face.bbox
        bbox_x = float(x1 / w)
        bbox_y = float(y1 / h)
        bbox_w = float((x2 - x1) / w)
        bbox_h = float((y2 - y1) / h)
        results.append(
            {
                "embedding": face.embedding.astype(np.float32).tobytes(),
                "bbox_x": bbox_x,
                "bbox_y": bbox_y,
                "bbox_w": bbox_w,
                "bbox_h": bbox_h,
                "confidence": float(face.det_score),
                "img": img,
                "bbox_px": (int(x1), int(y1), int(x2), int(y2)),
            }
        )
    return results


def _save_face_crop(img: np.ndarray, bbox_px: tuple, face_id: int) -> str:
    """Crop face region with 30% expansion, resize to 112x112, save as JPEG."""
    FACE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    x1, y1, x2, y2 = bbox_px
    h, w = img.shape[:2]

    bw = x2 - x1
    bh = y2 - y1
    expand_x = int(bw * 0.3)
    expand_y = int(bh * 0.3)

    x1 = max(0, x1 - expand_x)
    y1 = max(0, y1 - expand_y)
    x2 = min(w, x2 + expand_x)
    y2 = min(h, y2 + expand_y)

    crop = img[y1:y2, x1:x2]
    # BGR -> RGB
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(crop_rgb)
    pil_img = pil_img.resize((112, 112), Image.LANCZOS)

    out_path = FACE_CACHE_DIR / f"{face_id}.jpg"
    pil_img.save(str(out_path), quality=85)
    return str(out_path)


async def scan_faces(db, tg, force_rescan: bool = False) -> None:
    """Main face scanning pipeline."""
    try:
        if force_rescan:
            logger.info("Force rescan: resetting all face data")
            await db.execute("UPDATE media_items SET faces_scanned = 0")
            await db.execute("DELETE FROM faces")
            await clear_person_assignments(db)
            await db.commit()

        total = await get_unscanned_photo_count(db)
        await update_face_scan_state(
            db, status="scanning", scanned_count=0, total_count=total
        )

        if total == 0:
            logger.info("No unscanned photos, skipping to clustering")
        else:
            scanned = 0
            while True:
                batch = await get_unscanned_photos(db, limit=20)
                if not batch:
                    break

                batch_media_ids = []
                for photo in batch:
                    try:
                        media_id = photo["id"]
                        # Find image path
                        img_path = photo.get("download_path") or photo.get(
                            "thumbnail_path"
                        )
                        if not img_path or not Path(img_path).exists():
                            img_path = await _download_for_scan(tg, photo)
                        if not img_path:
                            logger.debug(
                                "No image available for media %d, skipping", media_id
                            )
                            batch_media_ids.append(media_id)
                            scanned += 1
                            continue

                        detected = await asyncio.to_thread(
                            _detect_faces_in_image, str(img_path)
                        )

                        if detected:
                            now = datetime.now(tz=timezone.utc).isoformat()
                            face_rows = [
                                {
                                    "media_id": media_id,
                                    "embedding": f["embedding"],
                                    "bbox_x": f["bbox_x"],
                                    "bbox_y": f["bbox_y"],
                                    "bbox_w": f["bbox_w"],
                                    "bbox_h": f["bbox_h"],
                                    "confidence": f["confidence"],
                                    "crop_path": None,
                                    "created_at": now,
                                }
                                for f in detected
                            ]
                            face_ids = await insert_faces_batch(db, face_rows)

                            # Save crops and update crop_path
                            for face_id, f in zip(face_ids, detected):
                                try:
                                    crop_path = await asyncio.to_thread(
                                        _save_face_crop,
                                        f["img"],
                                        f["bbox_px"],
                                        face_id,
                                    )
                                    await db.execute(
                                        "UPDATE faces SET crop_path = ? WHERE id = ?",
                                        (crop_path, face_id),
                                    )
                                except Exception:
                                    logger.exception(
                                        "Failed to save crop for face %d", face_id
                                    )

                        scanned += 1
                        batch_media_ids.append(media_id)

                        if scanned % 5 == 0:
                            await update_face_scan_state(
                                db, scanned_count=scanned, total_count=total
                            )

                    except Exception:
                        logger.exception(
                            "Error processing photo %d", photo.get("id", -1)
                        )
                        batch_media_ids.append(photo["id"])
                        scanned += 1

                if batch_media_ids:
                    await mark_media_scanned(db, batch_media_ids)
                    await db.commit()

            await update_face_scan_state(db, scanned_count=scanned, total_count=total)

        # Clustering phase
        await update_face_scan_state(db, status="clustering")
        await cluster_faces(db)
        await update_face_scan_state(db, status="done")
        logger.info("Face scan complete")

    except Exception:
        logger.exception("Face scan failed")
        await update_face_scan_state(db, status="error", last_error="Scan failed")


async def cluster_faces(db) -> None:
    """Cluster face embeddings using DBSCAN and assign persons."""
    all_faces = await get_all_face_embeddings(db)
    if not all_faces:
        logger.info("No faces to cluster")
        return

    face_ids = [f["id"] for f in all_faces]
    embeddings = np.array(
        [np.frombuffer(f["embedding"], dtype=np.float32) for f in all_faces]
    )

    # L2-normalize
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    embeddings = embeddings / norms

    from sklearn.cluster import DBSCAN

    labels = await asyncio.to_thread(
        lambda: DBSCAN(eps=0.5, min_samples=2, metric="cosine")
        .fit(embeddings)
        .labels_
    )

    await clear_person_assignments(db)

    # Get confidence scores for picking representatives
    confidence_cursor = await db.execute("SELECT id, confidence FROM faces")
    conf_rows = await confidence_cursor.fetchall()
    conf_map = {r[0]: r[1] for r in conf_rows}

    # Build clusters
    cluster_map: dict[int, list[int]] = {}
    for face_id, label in zip(face_ids, labels):
        if label == -1:
            continue
        cluster_map.setdefault(label, []).append(face_id)

    clusters = []
    for _label, fids in cluster_map.items():
        representative = max(fids, key=lambda fid: conf_map.get(fid, 0.0))
        clusters.append(
            {
                "face_ids": fids,
                "representative_face_id": representative,
            }
        )

    if clusters:
        await bulk_assign_persons(db, clusters)
    await db.commit()
    logger.info("Clustered %d faces into %d persons", len(face_ids), len(clusters))


async def _download_for_scan(tg, photo: dict) -> str | None:
    """Download a thumbnail for face scanning if not already cached."""
    chat_id = photo.get("chat_id")
    message_id = photo.get("message_id")
    if not chat_id or not message_id:
        return None

    cached = CACHE_DIR / f"{chat_id}_{message_id}.jpg"
    if cached.exists():
        return str(cached)

    try:
        await tg.acquire_semaphore()
        try:
            messages = await tg.client.get_messages(chat_id, ids=message_id)
            msg = messages if not isinstance(messages, list) else messages[0]
            if not msg or not msg.media:
                return None
            data = await tg.client.download_media(msg, bytes, thumb=-1)
            if not data:
                return None
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(data)
            return str(cached)
        finally:
            tg.release_semaphore()
    except Exception:
        logger.exception(
            "Failed to download thumbnail for %s/%s", chat_id, message_id
        )
        return None
