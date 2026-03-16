from __future__ import annotations

import sqlite3

import aiosqlite
from datetime import datetime, timedelta, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS media_items (
    id              INTEGER PRIMARY KEY,
    message_id      INTEGER NOT NULL,
    chat_id         INTEGER NOT NULL,
    chat_name       TEXT NOT NULL,
    date            DATETIME NOT NULL,
    media_type      TEXT NOT NULL,
    mime_type       TEXT,
    file_size       INTEGER,
    width           INTEGER,
    height          INTEGER,
    duration        REAL,
    caption         TEXT,
    file_id         INTEGER,
    access_hash     INTEGER,
    file_ref        BLOB,
    thumbnail_path  TEXT,
    UNIQUE(message_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_media_date ON media_items(date DESC);
CREATE INDEX IF NOT EXISTS idx_media_chat ON media_items(chat_id);
CREATE INDEX IF NOT EXISTS idx_media_type ON media_items(media_type);
CREATE INDEX IF NOT EXISTS idx_media_hidden ON media_items(hidden_at);
CREATE INDEX IF NOT EXISTS idx_media_favorited ON media_items(favorited_at);
CREATE INDEX IF NOT EXISTS idx_media_chat_date ON media_items(chat_id, date DESC);

CREATE TABLE IF NOT EXISTS sync_state (
    chat_id         INTEGER PRIMARY KEY,
    chat_name       TEXT NOT NULL,
    active          INTEGER NOT NULL DEFAULT 0,
    last_msg_id     INTEGER NOT NULL DEFAULT 0,
    last_synced     DATETIME
);

CREATE TABLE IF NOT EXISTS dialogs (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    unread_count    INTEGER NOT NULL DEFAULT 0,
    last_message_date DATETIME,
    updated_at      DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS persons (
    id              INTEGER PRIMARY KEY,
    name            TEXT,
    representative_face_id INTEGER,
    face_count      INTEGER NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL,
    updated_at      DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS faces (
    id              INTEGER PRIMARY KEY,
    media_id        INTEGER NOT NULL,
    person_id       INTEGER,
    embedding       BLOB NOT NULL,
    bbox_x          REAL NOT NULL,
    bbox_y          REAL NOT NULL,
    bbox_w          REAL NOT NULL,
    bbox_h          REAL NOT NULL,
    confidence      REAL NOT NULL,
    crop_path       TEXT,
    created_at      DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_faces_media ON faces(media_id);
CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_id);

CREATE TABLE IF NOT EXISTS face_scan_state (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'idle',
    scanned_count   INTEGER NOT NULL DEFAULT 0,
    total_count     INTEGER NOT NULL DEFAULT 0,
    last_scanned_media_id INTEGER,
    last_error      TEXT,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


# region Init
async def init_db(db: aiosqlite.Connection) -> None:
    await db.executescript(SCHEMA)
    db.row_factory = aiosqlite.Row
    # Migrations for columns added after initial schema
    for migration in [
        "ALTER TABLE dialogs ADD COLUMN last_message_date DATETIME",
        "ALTER TABLE media_items ADD COLUMN download_path TEXT",
        "ALTER TABLE media_items ADD COLUMN hidden_at DATETIME",
        "ALTER TABLE media_items ADD COLUMN favorited_at DATETIME",
        "ALTER TABLE dialogs ADD COLUMN hidden_at DATETIME",
        "ALTER TABLE media_items ADD COLUMN sender_name TEXT",
        "CREATE INDEX IF NOT EXISTS idx_media_hidden ON media_items(hidden_at)",
        "CREATE INDEX IF NOT EXISTS idx_media_favorited ON media_items(favorited_at)",
        "CREATE INDEX IF NOT EXISTS idx_media_chat_date ON media_items(chat_id, date DESC)",
        "ALTER TABLE media_items ADD COLUMN faces_scanned INTEGER DEFAULT 0",
    ]:
        try:
            await db.execute(migration)
        except sqlite3.OperationalError:
            pass  # Column already exists
    await db.commit()


# endregion


# region Media CRUD
async def insert_media_item(db: aiosqlite.Connection, item: dict) -> None:
    await db.execute(
        """INSERT OR IGNORE INTO media_items
        (message_id, chat_id, chat_name, date, media_type, mime_type,
         file_size, width, height, duration, caption, file_id, access_hash,
         file_ref, thumbnail_path, sender_name)
        VALUES (:message_id, :chat_id, :chat_name, :date, :media_type, :mime_type,
                :file_size, :width, :height, :duration, :caption, :file_id,
                :access_hash, :file_ref, :thumbnail_path, :sender_name)""",
        item,
    )
    await db.commit()


async def insert_media_batch(db: aiosqlite.Connection, items: list[dict]) -> None:
    """Insert up to 100 media items in a single transaction."""
    if not items:
        return
    await db.executemany(
        """INSERT OR IGNORE INTO media_items
        (message_id, chat_id, chat_name, date, media_type, mime_type,
         file_size, width, height, duration, caption, file_id, access_hash,
         file_ref, thumbnail_path, sender_name)
        VALUES (:message_id, :chat_id, :chat_name, :date, :media_type, :mime_type,
                :file_size, :width, :height, :duration, :caption, :file_id,
                :access_hash, :file_ref, :thumbnail_path, :sender_name)""",
        items,
    )
    await db.commit()


async def update_sync_progress(
    db: aiosqlite.Connection, chat_id: int, last_msg_id: int
) -> None:
    """Lightweight checkpoint: bump last_msg_id and last_synced only."""
    await db.execute(
        """UPDATE sync_state
        SET last_msg_id = MAX(last_msg_id, :last_msg_id),
            last_synced = :now
        WHERE chat_id = :chat_id""",
        {
            "chat_id": chat_id,
            "last_msg_id": last_msg_id,
            "now": datetime.now(timezone.utc).isoformat(),
        },
    )
    await db.commit()


async def _paginate_media(
    db: aiosqlite.Connection,
    conditions: list[str],
    params: dict,
    cursor_id: int | None = None,
    cursor_value: str | None = None,
    cursor_column: str = "date",
    limit: int = 50,
    order_by: str = "id DESC",
) -> list[dict]:
    """Shared cursor-based pagination for media queries.

    When cursor_value is provided alongside cursor_id, uses composite
    keyset pagination: (cursor_column, id) < (cursor_value, cursor_id).
    Otherwise falls back to simple id-based pagination.
    """
    params["limit"] = limit
    if cursor_id is not None:
        if cursor_value is not None:
            col = cursor_column
            conditions.append(
                f"({col} < :cursor_value"
                f" OR ({col} = :cursor_value AND id < :cursor_id))"
            )
            params["cursor_value"] = cursor_value
        else:
            conditions.append("id < :cursor_id")
        params["cursor_id"] = cursor_id

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"SELECT * FROM media_items {where} ORDER BY {order_by} LIMIT :limit"

    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def get_media_page(
    db: aiosqlite.Connection,
    cursor_id: int | None = None,
    cursor_value: str | None = None,
    limit: int = 50,
    group_ids: list[int] | None = None,
    media_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[dict]:
    conditions = [
        "hidden_at IS NULL",
        "chat_id NOT IN (SELECT id FROM dialogs WHERE hidden_at IS NOT NULL)",
    ]
    params: dict = {}

    if group_ids:
        placeholders = ", ".join(f":gid_{i}" for i, _ in enumerate(group_ids))
        conditions.append(f"chat_id IN ({placeholders})")
        for i, g in enumerate(group_ids):
            params[f"gid_{i}"] = g

    if media_type:
        conditions.append("media_type = :media_type")
        params["media_type"] = media_type

    if date_from:
        conditions.append("date >= :date_from")
        params["date_from"] = date_from

    if date_to:
        date_to_exclusive = (
            datetime.fromisoformat(date_to) + timedelta(days=1)
        ).strftime("%Y-%m-%d")
        conditions.append("date < :date_to_exclusive")
        params["date_to_exclusive"] = date_to_exclusive

    return await _paginate_media(
        db,
        conditions,
        params,
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        cursor_column="date",
        limit=limit,
        order_by="date DESC, id DESC",
    )


# endregion


# region Sync state
async def upsert_sync_state(
    db: aiosqlite.Connection,
    chat_id: int,
    chat_name: str,
    active: bool,
    last_msg_id: int = 0,
) -> None:
    await db.execute(
        """INSERT INTO sync_state (chat_id, chat_name, active, last_msg_id, last_synced)
        VALUES (:chat_id, :chat_name, :active, :last_msg_id, :now)
        ON CONFLICT(chat_id) DO UPDATE SET
            chat_name = :chat_name,
            active = :active,
            last_msg_id = MAX(sync_state.last_msg_id, :last_msg_id),
            last_synced = :now""",
        {
            "chat_id": chat_id,
            "chat_name": chat_name,
            "active": int(active),
            "last_msg_id": last_msg_id,
            "now": datetime.now(timezone.utc).isoformat(),
        },
    )
    await db.commit()


async def get_sync_state(db: aiosqlite.Connection, chat_id: int) -> dict | None:
    cursor = await db.execute("SELECT * FROM sync_state WHERE chat_id = ?", (chat_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def get_all_sync_states(db: aiosqlite.Connection) -> list[dict]:
    cursor = await db.execute("SELECT * FROM sync_state ORDER BY chat_name")
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def update_file_ref(
    db: aiosqlite.Connection, media_id: int, file_ref: bytes
) -> None:
    await db.execute(
        "UPDATE media_items SET file_ref = ? WHERE id = ?", (file_ref, media_id)
    )
    await db.commit()


# endregion


# region Clear media
async def clear_chat_media(db: aiosqlite.Connection, chat_id: int) -> None:
    """Delete all media items and reset sync state for a chat."""
    await db.execute("DELETE FROM media_items WHERE chat_id = ?", (chat_id,))
    await db.execute(
        "UPDATE sync_state SET last_msg_id = 0, last_synced = NULL WHERE chat_id = ?",
        (chat_id,),
    )
    await db.commit()


async def clear_all_media(db: aiosqlite.Connection) -> list[str]:
    """Delete all media items and reset all sync states. Returns cached file paths for cleanup."""
    cursor = await db.execute(
        "SELECT thumbnail_path, download_path FROM media_items "
        "WHERE thumbnail_path IS NOT NULL OR download_path IS NOT NULL"
    )
    rows = await cursor.fetchall()
    paths = [p for row in rows for p in (row[0], row[1]) if p]
    await db.execute("DELETE FROM media_items")
    await db.execute("UPDATE sync_state SET last_msg_id = 0, last_synced = NULL")
    await db.commit()
    return paths


# endregion


# region Media lookups
async def get_media_by_ids(
    db: aiosqlite.Connection, media_ids: list[int]
) -> list[dict]:
    if not media_ids:
        return []
    placeholders = ", ".join("?" for _ in media_ids)
    cursor = await db.execute(
        f"SELECT * FROM media_items WHERE id IN ({placeholders})", media_ids
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def get_media_by_id(db: aiosqlite.Connection, media_id: int) -> dict | None:
    cursor = await db.execute("SELECT * FROM media_items WHERE id = ?", (media_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


# endregion


# region Hidden
async def hide_media_item(db: aiosqlite.Connection, media_id: int) -> None:
    await db.execute(
        "UPDATE media_items SET hidden_at = ? WHERE id = ?",
        (datetime.now(timezone.utc).isoformat(), media_id),
    )
    await db.commit()


async def hide_media_items(db: aiosqlite.Connection, media_ids: list[int]) -> None:
    if not media_ids:
        return
    placeholders = ", ".join("?" for _ in media_ids)
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        f"UPDATE media_items SET hidden_at = ? WHERE id IN ({placeholders})",
        [now, *media_ids],
    )
    await db.commit()


async def favorite_media_items(db: aiosqlite.Connection, media_ids: list[int]) -> None:
    if not media_ids:
        return
    placeholders = ", ".join("?" for _ in media_ids)
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        f"UPDATE media_items SET favorited_at = ? WHERE id IN ({placeholders})",
        [now, *media_ids],
    )
    await db.commit()


async def unhide_media_items(db: aiosqlite.Connection, media_ids: list[int]) -> None:
    if not media_ids:
        return
    placeholders = ", ".join("?" for _ in media_ids)
    await db.execute(
        f"UPDATE media_items SET hidden_at = NULL WHERE id IN ({placeholders})",
        media_ids,
    )
    await db.commit()


async def get_hidden_media_page(
    db: aiosqlite.Connection,
    cursor_id: int | None = None,
    cursor_value: str | None = None,
    limit: int = 50,
) -> list[dict]:
    return await _paginate_media(
        db,
        ["hidden_at IS NOT NULL"],
        {},
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        cursor_column="hidden_at",
        limit=limit,
        order_by="hidden_at DESC, id DESC",
    )


async def get_hidden_count(db: aiosqlite.Connection) -> int:
    cursor = await db.execute(
        "SELECT COUNT(*) FROM media_items WHERE hidden_at IS NOT NULL"
    )
    row = await cursor.fetchone()
    return row[0] if row else 0


# endregion


# region Hidden dialogs
async def hide_dialog(db: aiosqlite.Connection, dialog_id: int) -> None:
    await db.execute(
        "UPDATE dialogs SET hidden_at = ? WHERE id = ?",
        (datetime.now(timezone.utc).isoformat(), dialog_id),
    )
    await db.commit()


async def unhide_dialogs(db: aiosqlite.Connection, dialog_ids: list[int]) -> None:
    if not dialog_ids:
        return
    placeholders = ", ".join("?" for _ in dialog_ids)
    await db.execute(
        f"UPDATE dialogs SET hidden_at = NULL WHERE id IN ({placeholders})",
        dialog_ids,
    )
    await db.commit()


async def get_hidden_dialogs(db: aiosqlite.Connection) -> list[dict]:
    cursor = await db.execute(
        "SELECT * FROM dialogs WHERE hidden_at IS NOT NULL ORDER BY hidden_at DESC"
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def get_hidden_dialog_count(db: aiosqlite.Connection) -> int:
    cursor = await db.execute(
        "SELECT COUNT(*) FROM dialogs WHERE hidden_at IS NOT NULL"
    )
    row = await cursor.fetchone()
    return row[0] if row else 0


# endregion


# region Favorites
async def favorite_media_item(db: aiosqlite.Connection, media_id: int) -> None:
    await db.execute(
        "UPDATE media_items SET favorited_at = ? WHERE id = ?",
        (datetime.now(timezone.utc).isoformat(), media_id),
    )
    await db.commit()


async def unfavorite_media_item(db: aiosqlite.Connection, media_id: int) -> None:
    await db.execute(
        "UPDATE media_items SET favorited_at = NULL WHERE id = ?",
        (media_id,),
    )
    await db.commit()


async def get_favorites_media_page(
    db: aiosqlite.Connection,
    cursor_id: int | None = None,
    cursor_value: str | None = None,
    limit: int = 50,
) -> list[dict]:
    return await _paginate_media(
        db,
        ["favorited_at IS NOT NULL"],
        {},
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        cursor_column="favorited_at",
        limit=limit,
        order_by="favorited_at DESC, id DESC",
    )


async def get_favorites_count(db: aiosqlite.Connection) -> int:
    cursor = await db.execute(
        "SELECT COUNT(*) FROM media_items WHERE favorited_at IS NOT NULL"
    )
    row = await cursor.fetchone()
    return row[0] if row else 0


# endregion


# region Dialogs
async def upsert_dialogs_batch(db: aiosqlite.Connection, dialogs: list[dict]) -> None:
    """Bulk upsert dialog metadata into the dialogs table."""
    if not dialogs:
        return
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "id": d["id"],
            "name": d["name"],
            "type": d["type"],
            "unread_count": d["unread_count"],
            "last_message_date": d.get("last_message_date"),
            "updated_at": now,
        }
        for d in dialogs
    ]
    await db.executemany(
        """INSERT INTO dialogs (id, name, type, unread_count, last_message_date, updated_at)
        VALUES (:id, :name, :type, :unread_count, :last_message_date, :updated_at)
        ON CONFLICT(id) DO UPDATE SET
            name = :name,
            type = :type,
            unread_count = :unread_count,
            last_message_date = :last_message_date,
            updated_at = :updated_at""",
        rows,
    )
    await db.commit()


async def get_all_dialogs(db: aiosqlite.Connection) -> list[dict]:
    """Fetch visible dialogs that have messages, ordered by most recent message first."""
    cursor = await db.execute(
        "SELECT * FROM dialogs WHERE last_message_date IS NOT NULL "
        "AND hidden_at IS NULL "
        "ORDER BY last_message_date DESC"
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


# endregion


# region Faces

async def get_unscanned_photos(db: aiosqlite.Connection, limit: int = 50) -> list[dict]:
    """Photos not yet scanned for faces, prioritizing those with cached thumbnails."""
    cursor = await db.execute(
        """SELECT * FROM media_items
           WHERE media_type = 'photo' AND faces_scanned = 0
           ORDER BY thumbnail_path IS NOT NULL DESC, id DESC
           LIMIT ?""",
        (limit,),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_unscanned_photo_count(db: aiosqlite.Connection) -> int:
    cursor = await db.execute(
        "SELECT COUNT(*) FROM media_items WHERE media_type = 'photo' AND faces_scanned = 0"
    )
    row = await cursor.fetchone()
    return row[0] if row else 0


async def get_total_photo_count(db: aiosqlite.Connection) -> int:
    cursor = await db.execute(
        "SELECT COUNT(*) FROM media_items WHERE media_type = 'photo'"
    )
    row = await cursor.fetchone()
    return row[0] if row else 0


async def insert_faces_batch(db: aiosqlite.Connection, faces: list[dict]) -> list[int]:
    """Insert face rows, return their IDs."""
    ids = []
    for face in faces:
        cursor = await db.execute(
            """INSERT INTO faces (media_id, embedding, bbox_x, bbox_y, bbox_w, bbox_h,
               confidence, crop_path, created_at)
               VALUES (:media_id, :embedding, :bbox_x, :bbox_y, :bbox_w, :bbox_h,
               :confidence, :crop_path, :created_at)""",
            face,
        )
        ids.append(cursor.lastrowid)
    return ids


async def mark_media_scanned(db: aiosqlite.Connection, media_ids: list[int]) -> None:
    if not media_ids:
        return
    placeholders = ", ".join("?" for _ in media_ids)
    await db.execute(
        f"UPDATE media_items SET faces_scanned = 1 WHERE id IN ({placeholders})",
        media_ids,
    )


async def get_all_face_embeddings(db: aiosqlite.Connection) -> list[dict]:
    cursor = await db.execute("SELECT id, embedding FROM faces")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def clear_person_assignments(db: aiosqlite.Connection) -> None:
    await db.execute("UPDATE faces SET person_id = NULL")
    await db.execute("DELETE FROM persons")


async def bulk_assign_persons(db: aiosqlite.Connection, clusters: list[dict]) -> None:
    """Create persons and assign faces.

    Each cluster dict: {face_ids: list[int], representative_face_id: int}
    """
    now = datetime.now(tz=timezone.utc).isoformat()
    for cluster in clusters:
        cursor = await db.execute(
            """INSERT INTO persons (representative_face_id, face_count, created_at, updated_at)
               VALUES (?, ?, ?, ?)""",
            (cluster["representative_face_id"], len(cluster["face_ids"]), now, now),
        )
        person_id = cursor.lastrowid
        placeholders = ", ".join("?" for _ in cluster["face_ids"])
        await db.execute(
            f"UPDATE faces SET person_id = ? WHERE id IN ({placeholders})",
            [person_id, *cluster["face_ids"]],
        )


async def get_all_persons(db: aiosqlite.Connection) -> list[dict]:
    cursor = await db.execute(
        """SELECT p.*, f.crop_path as avatar_crop_path
           FROM persons p
           LEFT JOIN faces f ON f.id = p.representative_face_id
           ORDER BY p.face_count DESC"""
    )
    rows = await cursor.fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["display_name"] = d["name"] or f"Person {d['id']}"
        result.append(d)
    return result


async def get_person(db: aiosqlite.Connection, person_id: int) -> dict | None:
    cursor = await db.execute(
        """SELECT p.*, f.crop_path as avatar_crop_path
           FROM persons p
           LEFT JOIN faces f ON f.id = p.representative_face_id
           WHERE p.id = ?""",
        (person_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    d["display_name"] = d["name"] or f"Person {d['id']}"
    return d


async def rename_person(db: aiosqlite.Connection, person_id: int, name: str) -> None:
    now = datetime.now(tz=timezone.utc).isoformat()
    await db.execute(
        "UPDATE persons SET name = ?, updated_at = ? WHERE id = ?",
        (name, now, person_id),
    )
    await db.commit()


async def merge_persons(db: aiosqlite.Connection, keep_id: int, merge_id: int) -> None:
    """Move all faces from merge_id to keep_id, delete merge_id."""
    await db.execute(
        "UPDATE faces SET person_id = ? WHERE person_id = ?",
        (keep_id, merge_id),
    )
    cursor = await db.execute(
        "SELECT COUNT(*) FROM faces WHERE person_id = ?", (keep_id,)
    )
    row = await cursor.fetchone()
    now = datetime.now(tz=timezone.utc).isoformat()
    await db.execute(
        "UPDATE persons SET face_count = ?, updated_at = ? WHERE id = ?",
        (row[0], now, keep_id),
    )
    await db.execute("DELETE FROM persons WHERE id = ?", (merge_id,))
    await db.commit()


async def remove_face_from_person(db: aiosqlite.Connection, face_id: int) -> None:
    """Unassign a face from its person, update counts."""
    cursor = await db.execute(
        "SELECT person_id FROM faces WHERE id = ?", (face_id,)
    )
    row = await cursor.fetchone()
    if not row or not row[0]:
        return
    person_id = row[0]
    await db.execute("UPDATE faces SET person_id = NULL WHERE id = ?", (face_id,))
    now = datetime.now(tz=timezone.utc).isoformat()
    await db.execute(
        "UPDATE persons SET face_count = face_count - 1, updated_at = ? WHERE id = ?",
        (now, person_id),
    )
    await db.execute(
        "DELETE FROM persons WHERE id = ? AND face_count <= 0", (person_id,)
    )
    await db.commit()


async def get_person_media_page(
    db: aiosqlite.Connection,
    person_id: int,
    cursor_id: int | None = None,
    cursor_value: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Get media items containing a specific person's face."""
    conditions = [
        "hidden_at IS NULL",
        "id IN (SELECT media_id FROM faces WHERE person_id = :person_id)",
    ]
    params: dict = {"person_id": person_id}
    return await _paginate_media(
        db,
        conditions,
        params,
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        cursor_column="date",
        limit=limit,
        order_by="date DESC, id DESC",
    )


async def get_face_scan_state(db: aiosqlite.Connection) -> dict:
    cursor = await db.execute("SELECT * FROM face_scan_state WHERE id = 1")
    row = await cursor.fetchone()
    if not row:
        return {"status": "idle", "scanned_count": 0, "total_count": 0}
    return dict(row)


async def update_face_scan_state(db: aiosqlite.Connection, **kwargs) -> None:
    cursor = await db.execute("SELECT id FROM face_scan_state WHERE id = 1")
    row = await cursor.fetchone()
    now = datetime.now(tz=timezone.utc).isoformat()
    if not row:
        await db.execute(
            """INSERT INTO face_scan_state (id, status, scanned_count, total_count, updated_at)
               VALUES (1, 'idle', 0, 0, ?)""",
            (now,),
        )
    sets = ", ".join(f"{k} = :{k}" for k in kwargs)
    kwargs["now"] = now
    await db.execute(
        f"UPDATE face_scan_state SET {sets}, updated_at = :now WHERE id = 1",
        kwargs,
    )
    await db.commit()


async def get_person_count(db: aiosqlite.Connection) -> int:
    cursor = await db.execute("SELECT COUNT(*) FROM persons")
    row = await cursor.fetchone()
    return row[0] if row else 0


# endregion
