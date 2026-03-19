from __future__ import annotations

import sqlite3
from typing import Literal

import aiosqlite
from datetime import datetime, timedelta

from utils import utc_now_iso

FacesFilter = Literal["none", "solo", "group"]


def _apply_faces_filter(conditions: list[str], faces: FacesFilter | None) -> None:
    if faces == "none":
        conditions.append("face_count = 0")
    elif faces == "solo":
        conditions.append("face_count = 1")
    elif faces == "group":
        conditions.append("face_count >= 2")

SCHEMA = """
CREATE TABLE IF NOT EXISTS media_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
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
    download_path   TEXT,
    hidden_at       DATETIME,
    favorited_at    DATETIME,
    sender_name     TEXT,
    faces_scanned   INTEGER DEFAULT 0,
    face_count      INTEGER DEFAULT NULL,
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
    hidden_at       DATETIME,
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
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id        INTEGER NOT NULL,
    person_id       INTEGER,
    embedding       BLOB NOT NULL,
    bbox_x          REAL NOT NULL,
    bbox_y          REAL NOT NULL,
    bbox_w          REAL NOT NULL,
    bbox_h          REAL NOT NULL,
    confidence      REAL NOT NULL,
    crop_path       TEXT,
    created_at      DATETIME NOT NULL,
    pitch           REAL,
    yaw             REAL,
    roll            REAL,
    sharpness       REAL
);

CREATE INDEX IF NOT EXISTS idx_faces_media ON faces(media_id);
CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_id);
CREATE INDEX IF NOT EXISTS idx_media_unscanned ON media_items(media_type, faces_scanned);

CREATE TABLE IF NOT EXISTS face_scan_state (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'idle',
    scanned_count   INTEGER NOT NULL DEFAULT 0,
    total_count     INTEGER NOT NULL DEFAULT 0,
    last_scanned_media_id INTEGER,
    last_error      TEXT,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
"""


# region Init
async def _migrate_to_autoincrement(db: aiosqlite.Connection) -> None:
    """Recreate media_items and faces with AUTOINCREMENT to prevent ID reuse."""
    # Check if migration is needed (sqlite_sequence exists only with AUTOINCREMENT)
    async with await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
    ) as cursor:
        has_sequence = await cursor.fetchone()
    if has_sequence:
        async with await db.execute(
            "SELECT name FROM sqlite_sequence WHERE name='media_items'"
        ) as cursor:
            if await cursor.fetchone():
                return  # Already migrated

    # Run both table migrations in a single transaction so a crash
    # can't leave the DB partially migrated.
    stmts = [
        # -- media_items --
        """CREATE TABLE media_items_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL, chat_id INTEGER NOT NULL,
            chat_name TEXT NOT NULL, date DATETIME NOT NULL,
            media_type TEXT NOT NULL, mime_type TEXT, file_size INTEGER,
            width INTEGER, height INTEGER, duration REAL, caption TEXT,
            file_id INTEGER, access_hash INTEGER, file_ref BLOB,
            thumbnail_path TEXT, download_path TEXT, hidden_at DATETIME,
            favorited_at DATETIME, sender_name TEXT,
            faces_scanned INTEGER DEFAULT 0,
            face_count INTEGER DEFAULT NULL,
            UNIQUE(message_id, chat_id)
        )""",
        "INSERT INTO media_items_new SELECT * FROM media_items",
        "DROP TABLE media_items",
        "ALTER TABLE media_items_new RENAME TO media_items",
        "CREATE INDEX idx_media_date ON media_items(date DESC)",
        "CREATE INDEX idx_media_chat ON media_items(chat_id)",
        "CREATE INDEX idx_media_type ON media_items(media_type)",
        "CREATE INDEX idx_media_hidden ON media_items(hidden_at)",
        "CREATE INDEX idx_media_favorited ON media_items(favorited_at)",
        "CREATE INDEX idx_media_chat_date ON media_items(chat_id, date DESC)",
        "CREATE INDEX idx_media_face_count ON media_items(face_count)",
        # -- faces --
        """CREATE TABLE faces_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL, person_id INTEGER,
            embedding BLOB NOT NULL,
            bbox_x REAL NOT NULL, bbox_y REAL NOT NULL,
            bbox_w REAL NOT NULL, bbox_h REAL NOT NULL,
            confidence REAL NOT NULL, crop_path TEXT,
            created_at DATETIME NOT NULL,
            pitch REAL, yaw REAL, roll REAL, sharpness REAL
        )""",
        "INSERT INTO faces_new SELECT * FROM faces",
        "DROP TABLE faces",
        "ALTER TABLE faces_new RENAME TO faces",
        "CREATE INDEX idx_faces_media ON faces(media_id)",
        "CREATE INDEX idx_faces_person ON faces(person_id)",
    ]
    for stmt in stmts:
        await db.execute(stmt)


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
        "ALTER TABLE media_items ADD COLUMN face_count INTEGER DEFAULT NULL",
        "CREATE INDEX IF NOT EXISTS idx_media_face_count ON media_items(face_count)",
        "CREATE INDEX IF NOT EXISTS idx_media_unscanned ON media_items(media_type, faces_scanned)",
        "ALTER TABLE faces ADD COLUMN pitch REAL",
        "ALTER TABLE faces ADD COLUMN yaw REAL",
        "ALTER TABLE faces ADD COLUMN roll REAL",
        "ALTER TABLE faces ADD COLUMN sharpness REAL",
    ]:
        try:
            await db.execute(migration)
        except sqlite3.OperationalError:
            pass  # Column already exists

    # Backfill face_count for already-scanned photos that have NULL face_count
    await db.execute(
        """UPDATE media_items SET face_count = (
            SELECT COUNT(*) FROM faces WHERE faces.media_id = media_items.id
        ) WHERE faces_scanned = 1 AND face_count IS NULL"""
    )

    # Migrate media_items and faces to AUTOINCREMENT to prevent ID reuse
    # after clear+resync (which caused stale browser cache hits).
    await _migrate_to_autoincrement(db)

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
            "now": utc_now_iso(),
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
    sort_dir: str = "DESC",
) -> list[dict]:
    """Shared cursor-based pagination for media queries.

    When cursor_value is provided alongside cursor_id, uses composite
    keyset pagination: (cursor_column, id) < (cursor_value, cursor_id).
    Otherwise falls back to simple id-based pagination.

    sort_dir controls the cursor comparison direction:
    DESC uses ``<``, ASC uses ``>``.
    """
    cmp = "<" if sort_dir.upper() == "DESC" else ">"
    params["limit"] = limit
    if cursor_id is not None:
        if cursor_value is not None:
            col = cursor_column
            conditions.append(
                f"({col} {cmp} :cursor_value"
                f" OR ({col} = :cursor_value AND id {cmp} :cursor_id))"
            )
            params["cursor_value"] = cursor_value
        else:
            conditions.append(f"id {cmp} :cursor_id")
        params["cursor_id"] = cursor_id

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"SELECT * FROM media_items {where} ORDER BY {order_by} LIMIT :limit"

    async with await db.execute(query, params) as cursor:
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
    faces: FacesFilter | None = None,
    sort: str = "desc",
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

    _apply_faces_filter(conditions, faces)

    sd = sort.upper()
    return await _paginate_media(
        db,
        conditions,
        params,
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        cursor_column="date",
        limit=limit,
        order_by=f"date {sd}, id {sd}",
        sort_dir=sd,
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
            "now": utc_now_iso(),
        },
    )
    await db.commit()


async def get_sync_state(db: aiosqlite.Connection, chat_id: int) -> dict | None:
    async with await db.execute("SELECT * FROM sync_state WHERE chat_id = ?", (chat_id,)) as cursor:
        row = await cursor.fetchone()
    return dict(row) if row else None


async def get_all_sync_states(db: aiosqlite.Connection) -> list[dict]:
    async with await db.execute("SELECT * FROM sync_state ORDER BY chat_name") as cursor:
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def deactivate_sync_state(db: aiosqlite.Connection, chat_id: int) -> None:
    """Set active=0 for a chat's sync state without touching last_synced."""
    await db.execute(
        "UPDATE sync_state SET active = 0 WHERE chat_id = ?", (chat_id,)
    )
    await db.commit()


async def update_file_ref(
    db: aiosqlite.Connection, media_id: int, file_ref: bytes
) -> None:
    await db.execute(
        "UPDATE media_items SET file_ref = ? WHERE id = ?", (file_ref, media_id)
    )
    await db.commit()


# endregion


# region Clear media
async def clear_chat_media(db: aiosqlite.Connection, chat_id: int) -> list[str]:
    """Delete all media items, faces, persons, and reset sync/scan state for a chat.

    Returns cached file paths (thumbnails, downloads, face crops) for cleanup.
    """
    # Collect file paths for cleanup
    async with await db.execute(
        "SELECT thumbnail_path, download_path FROM media_items "
        "WHERE chat_id = ? AND (thumbnail_path IS NOT NULL OR download_path IS NOT NULL)",
        (chat_id,),
    ) as cursor:
        rows = await cursor.fetchall()
    paths = [p for row in rows for p in (row[0], row[1]) if p]

    async with await db.execute(
        "SELECT crop_path FROM faces WHERE media_id IN "
        "(SELECT id FROM media_items WHERE chat_id = ?) AND crop_path IS NOT NULL",
        (chat_id,),
    ) as cursor:
        paths += [row[0] for row in await cursor.fetchall()]

    # Delete orphaned persons (all their faces belong to this chat)
    await db.execute(
        "DELETE FROM persons WHERE id IN ("
        "  SELECT person_id FROM faces WHERE person_id IS NOT NULL "
        "  AND media_id IN (SELECT id FROM media_items WHERE chat_id = ?)"
        ") AND id NOT IN ("
        "  SELECT DISTINCT person_id FROM faces WHERE person_id IS NOT NULL "
        "  AND media_id NOT IN (SELECT id FROM media_items WHERE chat_id = ?)"
        ")",
        (chat_id, chat_id),
    )
    await db.execute(
        "DELETE FROM faces WHERE media_id IN "
        "(SELECT id FROM media_items WHERE chat_id = ?)",
        (chat_id,),
    )
    await db.execute("DELETE FROM media_items WHERE chat_id = ?", (chat_id,))
    await db.execute(
        "UPDATE sync_state SET last_msg_id = 0, last_synced = NULL WHERE chat_id = ?",
        (chat_id,),
    )
    # Update face counts for remaining persons
    await db.execute(
        "UPDATE persons SET face_count = ("
        "  SELECT COUNT(*) FROM faces WHERE person_id = persons.id"
        "), updated_at = ?",
        (utc_now_iso(),),
    )
    await db.commit()
    return paths


async def clear_all_media(db: aiosqlite.Connection) -> list[str]:
    """Delete all media items, faces, persons, and reset all sync/scan states.

    Returns cached file paths (thumbnails, downloads, face crops) for cleanup.
    """
    async with await db.execute(
        "SELECT thumbnail_path, download_path FROM media_items "
        "WHERE thumbnail_path IS NOT NULL OR download_path IS NOT NULL"
    ) as cursor:
        rows = await cursor.fetchall()
    paths = [p for row in rows for p in (row[0], row[1]) if p]

    async with await db.execute("SELECT crop_path FROM faces WHERE crop_path IS NOT NULL") as cursor:
        paths += [row[0] for row in await cursor.fetchall()]

    await db.execute("DELETE FROM faces")
    await db.execute("DELETE FROM persons")
    await db.execute("DELETE FROM media_items")
    await db.execute("UPDATE sync_state SET last_msg_id = 0, last_synced = NULL")
    await db.execute(
        "UPDATE face_scan_state SET status = 'idle', scanned_count = 0, "
        "total_count = 0, updated_at = ? WHERE id = 1",
        (utc_now_iso(),),
    )
    await db.execute(
        "UPDATE cache_jobs SET status = 'idle', total_items = 0, cached_items = 0, "
        "skipped_items = 0, failed_items = 0, bytes_cached = 0, last_media_id = NULL, "
        "flood_wait_until = NULL, error = NULL, updated_at = ? WHERE id = 1",
        (utc_now_iso(),),
    )
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
    async with await db.execute(
        f"SELECT * FROM media_items WHERE id IN ({placeholders})", media_ids
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def get_media_by_id(db: aiosqlite.Connection, media_id: int) -> dict | None:
    async with await db.execute("SELECT * FROM media_items WHERE id = ?", (media_id,)) as cursor:
        row = await cursor.fetchone()
    return dict(row) if row else None


# endregion


# region Hidden
async def hide_media_item(db: aiosqlite.Connection, media_id: int) -> None:
    await db.execute(
        "UPDATE media_items SET hidden_at = ? WHERE id = ?",
        (utc_now_iso(), media_id),
    )
    await db.commit()


async def hide_media_items(db: aiosqlite.Connection, media_ids: list[int]) -> None:
    if not media_ids:
        return
    placeholders = ", ".join("?" for _ in media_ids)
    now = utc_now_iso()
    await db.execute(
        f"UPDATE media_items SET hidden_at = ? WHERE id IN ({placeholders})",
        [now, *media_ids],
    )
    await db.commit()


async def favorite_media_items(db: aiosqlite.Connection, media_ids: list[int]) -> None:
    if not media_ids:
        return
    placeholders = ", ".join("?" for _ in media_ids)
    now = utc_now_iso()
    await db.execute(
        f"UPDATE media_items SET favorited_at = ? WHERE id IN ({placeholders})",
        [now, *media_ids],
    )
    await db.commit()


async def unfavorite_media_items(db: aiosqlite.Connection, media_ids: list[int]) -> None:
    if not media_ids:
        return
    placeholders = ", ".join("?" for _ in media_ids)
    await db.execute(
        f"UPDATE media_items SET favorited_at = NULL WHERE id IN ({placeholders})",
        media_ids,
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
    sort: str = "desc",
) -> list[dict]:
    sd = sort.upper()
    return await _paginate_media(
        db,
        ["hidden_at IS NOT NULL"],
        {},
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        cursor_column="hidden_at",
        limit=limit,
        order_by=f"hidden_at {sd}, id {sd}",
        sort_dir=sd,
    )


async def get_hidden_count(db: aiosqlite.Connection) -> int:
    async with await db.execute(
        "SELECT COUNT(*) FROM media_items WHERE hidden_at IS NOT NULL"
    ) as cursor:
        row = await cursor.fetchone()
    return row[0] if row else 0


# endregion


# region Hidden dialogs
async def hide_dialog(db: aiosqlite.Connection, dialog_id: int) -> None:
    await db.execute(
        "UPDATE dialogs SET hidden_at = ? WHERE id = ?",
        (utc_now_iso(), dialog_id),
    )
    await db.commit()


async def hide_dialogs(db: aiosqlite.Connection, dialog_ids: list[int]) -> None:
    if not dialog_ids:
        return
    placeholders = ", ".join("?" for _ in dialog_ids)
    await db.execute(
        f"UPDATE dialogs SET hidden_at = ? WHERE id IN ({placeholders})",
        (utc_now_iso(), *dialog_ids),
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
    async with await db.execute(
        "SELECT * FROM dialogs WHERE hidden_at IS NOT NULL ORDER BY hidden_at DESC"
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def get_hidden_dialog_count(db: aiosqlite.Connection) -> int:
    async with await db.execute(
        "SELECT COUNT(*) FROM dialogs WHERE hidden_at IS NOT NULL"
    ) as cursor:
        row = await cursor.fetchone()
    return row[0] if row else 0


async def get_hidden_media_ids(
    db: aiosqlite.Connection,
    sort: str = "desc",
) -> list[int]:
    sd = sort.upper()
    async with await db.execute(
        f"SELECT id FROM media_items WHERE hidden_at IS NOT NULL ORDER BY hidden_at {sd}, id {sd}"
    ) as cursor:
        rows = await cursor.fetchall()
    return [row[0] for row in rows]


async def delete_media_items_permanently(
    db: aiosqlite.Connection, media_ids: list[int]
) -> tuple[int, list[str]]:
    """Permanently delete media items and all associated data.

    Returns (deleted_count, file_paths_for_cleanup).
    """
    if not media_ids:
        return 0, []

    placeholders = ", ".join("?" for _ in media_ids)

    # 1. Collect file paths before deletion
    async with await db.execute(
        f"SELECT thumbnail_path, download_path FROM media_items "
        f"WHERE id IN ({placeholders}) "
        f"AND (thumbnail_path IS NOT NULL OR download_path IS NOT NULL)",
        media_ids,
    ) as cursor:
        rows = await cursor.fetchall()
    paths = [p for row in rows for p in (row[0], row[1]) if p]

    # 2. Collect crop paths from faces
    async with await db.execute(
        f"SELECT crop_path FROM faces "
        f"WHERE media_id IN ({placeholders}) AND crop_path IS NOT NULL",
        media_ids,
    ) as cursor:
        paths += [row[0] for row in await cursor.fetchall()]

    # 3. Collect affected person IDs
    async with await db.execute(
        f"SELECT DISTINCT person_id FROM faces "
        f"WHERE media_id IN ({placeholders}) AND person_id IS NOT NULL",
        media_ids,
    ) as cursor:
        affected_person_ids = [row[0] for row in await cursor.fetchall()]

    # 4. Delete faces
    await db.execute(
        f"DELETE FROM faces WHERE media_id IN ({placeholders})", media_ids
    )

    # 5. Update affected persons: recount faces, delete empty, reassign representative
    if affected_person_ids:
        p_placeholders = ", ".join("?" for _ in affected_person_ids)
        now = utc_now_iso()

        # Delete persons with no remaining faces
        await db.execute(
            f"DELETE FROM persons WHERE id IN ({p_placeholders}) "
            f"AND id NOT IN (SELECT DISTINCT person_id FROM faces WHERE person_id IS NOT NULL)",
            affected_person_ids,
        )

        # Recount face_count for surviving persons
        await db.execute(
            f"UPDATE persons SET face_count = ("
            f"  SELECT COUNT(*) FROM faces WHERE person_id = persons.id"
            f"), updated_at = ? WHERE id IN ({p_placeholders})",
            [now, *affected_person_ids],
        )

        # Reassign representative_face_id for surviving persons whose representative was deleted
        await db.execute(
            f"UPDATE persons SET representative_face_id = ("
            f"  SELECT MIN(id) FROM faces WHERE person_id = persons.id"
            f") WHERE id IN ({p_placeholders}) "
            f"AND representative_face_id NOT IN (SELECT id FROM faces)",
            affected_person_ids,
        )

    # 6. Delete media items
    async with await db.execute(
        f"DELETE FROM media_items WHERE id IN ({placeholders})", media_ids
    ) as cursor:
        deleted_count = cursor.rowcount

    await db.commit()
    return deleted_count, paths


# endregion


# region Favorites
async def favorite_media_item(db: aiosqlite.Connection, media_id: int) -> None:
    await db.execute(
        "UPDATE media_items SET favorited_at = ? WHERE id = ?",
        (utc_now_iso(), media_id),
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
    sort: str = "desc",
) -> list[dict]:
    sd = sort.upper()
    return await _paginate_media(
        db,
        ["favorited_at IS NOT NULL"],
        {},
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        cursor_column="favorited_at",
        limit=limit,
        order_by=f"favorited_at {sd}, id {sd}",
        sort_dir=sd,
    )


async def get_favorites_count(db: aiosqlite.Connection) -> int:
    async with await db.execute(
        "SELECT COUNT(*) FROM media_items WHERE favorited_at IS NOT NULL"
    ) as cursor:
        row = await cursor.fetchone()
    return row[0] if row else 0


async def get_favorites_media_ids(
    db: aiosqlite.Connection,
    sort: str = "desc",
) -> list[int]:
    sd = sort.upper()
    async with await db.execute(
        f"SELECT id FROM media_items WHERE favorited_at IS NOT NULL ORDER BY favorited_at {sd}, id {sd}"
    ) as cursor:
        rows = await cursor.fetchall()
    return [row[0] for row in rows]


async def get_media_count(
    db: aiosqlite.Connection,
    group_ids: list[int] | None = None,
    media_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    faces: FacesFilter | None = None,
) -> int:
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

    _apply_faces_filter(conditions, faces)

    where = " AND ".join(conditions)
    async with await db.execute(
        f"SELECT COUNT(*) FROM media_items WHERE {where}", params
    ) as cursor:
        row = await cursor.fetchone()
    return row[0] if row else 0


async def get_media_ids(
    db: aiosqlite.Connection,
    group_ids: list[int] | None = None,
    media_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    faces: FacesFilter | None = None,
    sort: str = "desc",
) -> list[int]:
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

    _apply_faces_filter(conditions, faces)

    where = " AND ".join(conditions)
    sd = sort.upper()
    async with await db.execute(
        f"SELECT id FROM media_items WHERE {where} ORDER BY date {sd}, id {sd}",
        params,
    ) as cursor:
        rows = await cursor.fetchall()
    return [row[0] for row in rows]


async def get_media_counts_by_chat(db: aiosqlite.Connection) -> dict[int, int]:
    async with await db.execute(
        "SELECT chat_id, COUNT(*) FROM media_items"
        " WHERE hidden_at IS NULL"
        " GROUP BY chat_id"
    ) as cursor:
        rows = await cursor.fetchall()
    return {row[0]: row[1] for row in rows}


# endregion


# region Dialogs
async def upsert_dialogs_batch(db: aiosqlite.Connection, dialogs: list[dict]) -> None:
    """Bulk upsert dialog metadata into the dialogs table."""
    if not dialogs:
        return
    now = utc_now_iso()
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
    async with await db.execute(
        "SELECT * FROM dialogs WHERE last_message_date IS NOT NULL "
        "AND hidden_at IS NULL "
        "ORDER BY last_message_date DESC"
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]


# endregion


# region Faces


async def get_unscanned_photos(db: aiosqlite.Connection, limit: int = 50) -> list[dict]:
    """Photos not yet scanned for faces, prioritizing those with cached thumbnails."""
    async with await db.execute(
        """SELECT * FROM media_items
           WHERE media_type = 'photo' AND faces_scanned = 0
           ORDER BY thumbnail_path IS NOT NULL DESC, id DESC
           LIMIT ?""",
        (limit,),
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_unscanned_photo_count(db: aiosqlite.Connection) -> int:
    async with await db.execute(
        "SELECT COUNT(*) FROM media_items WHERE media_type = 'photo' AND faces_scanned = 0"
    ) as cursor:
        row = await cursor.fetchone()
    return row[0] if row else 0


async def get_total_photo_count(db: aiosqlite.Connection) -> int:
    async with await db.execute(
        "SELECT COUNT(*) FROM media_items WHERE media_type = 'photo'"
    ) as cursor:
        row = await cursor.fetchone()
    return row[0] if row else 0


async def insert_faces_batch(db: aiosqlite.Connection, faces: list[dict]) -> list[int]:
    """Insert face rows, return their IDs."""
    if not faces:
        return []
    cols = "media_id, embedding, bbox_x, bbox_y, bbox_w, bbox_h, confidence, crop_path, created_at, pitch, yaw, roll, sharpness"
    keys = ["media_id", "embedding", "bbox_x", "bbox_y", "bbox_w", "bbox_h",
            "confidence", "crop_path", "created_at", "pitch", "yaw", "roll", "sharpness"]
    single = f"({', '.join('?' for _ in keys)})"
    chunk_size = 76  # 76 * 13 cols = 988 params, under SQLite's 999 limit
    all_ids: list[int] = []
    for i in range(0, len(faces), chunk_size):
        chunk = faces[i:i + chunk_size]
        params: list = []
        for face in chunk:
            params.extend(face[k] for k in keys)
        sql = f"INSERT INTO faces ({cols}) VALUES {', '.join(single for _ in chunk)} RETURNING id"
        async with await db.execute(sql, params) as cursor:
            rows = await cursor.fetchall()
        all_ids.extend(row[0] for row in rows)
    return all_ids


async def mark_media_scanned(
    db: aiosqlite.Connection,
    media_ids: list[int],
    face_counts: dict[int, int] | None = None,
) -> None:
    if not media_ids:
        return
    if face_counts:
        await db.executemany(
            "UPDATE media_items SET faces_scanned = 1, face_count = ? WHERE id = ?",
            [(face_counts.get(mid, 0), mid) for mid in media_ids],
        )
    else:
        placeholders = ", ".join("?" for _ in media_ids)
        await db.execute(
            f"UPDATE media_items SET faces_scanned = 1, face_count = 0 WHERE id IN ({placeholders})",
            media_ids,
        )
    await db.commit()


async def get_all_face_embeddings(db: aiosqlite.Connection) -> list[dict]:
    # Threshold must match MIN_CONFIDENCE in face_scanner.py
    async with await db.execute("SELECT id, embedding FROM faces WHERE confidence >= 0.5") as cursor:
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def clear_person_assignments(db: aiosqlite.Connection) -> None:
    await db.execute("UPDATE faces SET person_id = NULL")
    await db.execute("DELETE FROM persons")


async def bulk_assign_persons(db: aiosqlite.Connection, clusters: list[dict]) -> None:
    """Create persons and assign faces.

    Each cluster dict: {face_ids: list[int], representative_face_id: int}
    """
    now = utc_now_iso()
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


async def get_all_persons(
    db: aiosqlite.Connection, *, min_sharpness: float = 0
) -> dict:
    """Return persons list and max sharpness. Optionally filter by min face sharpness."""
    # Get max sharpness across all faces (unfiltered, for slider range)
    async with await db.execute("SELECT MAX(sharpness) FROM faces") as cursor:
        row = await cursor.fetchone()
    max_sharpness = row[0] if row and row[0] is not None else 0.0

    if min_sharpness > 0:
        # Filtered query: only include faces meeting sharpness threshold
        # NULL sharpness values are excluded when filtering (SQLite NULL >= x → NULL → excluded)
        async with await db.execute(
            """WITH qualified_faces AS (
                SELECT id, person_id, confidence, crop_path
                FROM faces
                WHERE person_id IS NOT NULL
                  AND sharpness >= ?
            )
            SELECT
                p.id, p.name, p.created_at, p.updated_at,
                COUNT(qf.id) AS face_count,
                (SELECT qf2.id FROM qualified_faces qf2
                 WHERE qf2.person_id = p.id
                 ORDER BY qf2.confidence DESC LIMIT 1) AS representative_face_id,
                (SELECT qf3.crop_path FROM qualified_faces qf3
                 WHERE qf3.person_id = p.id
                 ORDER BY qf3.confidence DESC LIMIT 1) AS avatar_crop_path
            FROM persons p
            JOIN qualified_faces qf ON qf.person_id = p.id
            GROUP BY p.id
            HAVING COUNT(qf.id) > 0
            ORDER BY face_count DESC""",
            (min_sharpness,),
        ) as cursor:
            rows = await cursor.fetchall()
    else:
        async with await db.execute(
            """SELECT p.*, f.crop_path as avatar_crop_path
               FROM persons p
               LEFT JOIN faces f ON f.id = p.representative_face_id
               ORDER BY p.face_count DESC"""
        ) as cursor:
            rows = await cursor.fetchall()

    result = []
    for r in rows:
        d = dict(r)
        d["display_name"] = d["name"] or f"Person {d['id']}"
        result.append(d)

    return {"persons": result, "max_sharpness": float(max_sharpness)}


async def get_person(db: aiosqlite.Connection, person_id: int) -> dict | None:
    async with await db.execute(
        """SELECT p.*, f.crop_path as avatar_crop_path
           FROM persons p
           LEFT JOIN faces f ON f.id = p.representative_face_id
           WHERE p.id = ?""",
        (person_id,),
    ) as cursor:
        row = await cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    d["display_name"] = d["name"] or f"Person {d['id']}"
    return d


async def rename_person(db: aiosqlite.Connection, person_id: int, name: str) -> None:
    now = utc_now_iso()
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
    async with await db.execute(
        "SELECT COUNT(*) FROM faces WHERE person_id = ?", (keep_id,)
    ) as cursor:
        row = await cursor.fetchone()
    now = utc_now_iso()
    await db.execute(
        "UPDATE persons SET face_count = ?, updated_at = ? WHERE id = ?",
        (row[0], now, keep_id),
    )
    await db.execute("DELETE FROM persons WHERE id = ?", (merge_id,))
    await db.commit()


async def merge_persons_batch(
    db: aiosqlite.Connection, keep_id: int, merge_ids: list[int]
) -> None:
    """Merge multiple persons into one. Atomic transaction."""
    # Guard against self-merge
    merge_ids = [mid for mid in merge_ids if mid != keep_id]
    if not merge_ids:
        return
    placeholders = ", ".join("?" for _ in merge_ids)
    await db.execute(
        f"UPDATE faces SET person_id = ? WHERE person_id IN ({placeholders})",
        [keep_id, *merge_ids],
    )
    async with await db.execute(
        "SELECT COUNT(*) FROM faces WHERE person_id = ?", (keep_id,)
    ) as cursor:
        row = await cursor.fetchone()
    now = utc_now_iso()
    await db.execute(
        "UPDATE persons SET face_count = ?, updated_at = ? WHERE id = ?",
        (row[0], now, keep_id),
    )
    await db.execute(
        f"DELETE FROM persons WHERE id IN ({placeholders})", merge_ids
    )
    await db.commit()


async def remove_face_from_person(db: aiosqlite.Connection, face_id: int) -> None:
    """Unassign a face from its person, update counts."""
    async with await db.execute("SELECT person_id FROM faces WHERE id = ?", (face_id,)) as cursor:
        row = await cursor.fetchone()
    if not row or not row[0]:
        return
    person_id = row[0]
    await db.execute("UPDATE faces SET person_id = NULL WHERE id = ?", (face_id,))
    now = utc_now_iso()
    await db.execute(
        "UPDATE persons SET face_count = face_count - 1, updated_at = ? WHERE id = ?",
        (now, person_id),
    )
    await db.execute(
        "DELETE FROM persons WHERE id = ? AND face_count <= 0", (person_id,)
    )
    await db.commit()


async def delete_person(db: aiosqlite.Connection, person_id: int) -> list[str]:
    """Delete a person and all associated face data. Returns crop paths for cleanup.

    Photos (media_items) are NOT deleted — only face linkage is removed.
    """
    # Check person exists
    async with await db.execute(
        "SELECT id FROM persons WHERE id = ?", (person_id,)
    ) as cursor:
        if not await cursor.fetchone():
            return []

    # Collect crop paths before deleting
    async with await db.execute(
        "SELECT crop_path FROM faces WHERE person_id = ? AND crop_path IS NOT NULL",
        (person_id,),
    ) as cursor:
        crop_paths = [row[0] for row in await cursor.fetchall()]

    # Collect affected media IDs
    async with await db.execute(
        "SELECT DISTINCT media_id FROM faces WHERE person_id = ?",
        (person_id,),
    ) as cursor:
        media_ids = [row[0] for row in await cursor.fetchall()]

    # Delete faces
    await db.execute("DELETE FROM faces WHERE person_id = ?", (person_id,))

    # Recount face_count for affected media
    if media_ids:
        placeholders = ", ".join("?" for _ in media_ids)
        await db.execute(
            f"""UPDATE media_items SET face_count = (
                SELECT COUNT(*) FROM faces WHERE media_id = media_items.id
            ) WHERE id IN ({placeholders})""",
            media_ids,
        )

    # Delete person
    await db.execute("DELETE FROM persons WHERE id = ?", (person_id,))
    await db.commit()

    return crop_paths


async def get_cross_person_conflicts(
    db: aiosqlite.Connection,
    media_ids: list[int],
    exclude_person_id: int,
) -> list[dict]:
    """Find other persons that have faces in the given media items.

    Returns a list of {media_id, persons: [{id, display_name}]} for media
    that have faces belonging to persons other than exclude_person_id.
    """
    if not media_ids:
        return []
    placeholders = ", ".join("?" for _ in media_ids)
    async with await db.execute(
        f"""SELECT f.media_id, p.id, p.name
            FROM faces f
            JOIN persons p ON f.person_id = p.id
            WHERE f.media_id IN ({placeholders})
              AND f.person_id != ?""",
        [*media_ids, exclude_person_id],
    ) as cursor:
        rows = await cursor.fetchall()

    if not rows:
        return []

    # Group by media_id
    by_media: dict[int, list[dict]] = {}
    for row in rows:
        mid = row[0]
        if mid not in by_media:
            by_media[mid] = []
        person = {"id": row[1], "display_name": row[2] or f"Person {row[1]}"}
        # Deduplicate (a person may have multiple faces in same photo)
        if not any(p["id"] == person["id"] for p in by_media[mid]):
            by_media[mid].append(person)

    return [{"media_id": mid, "persons": persons} for mid, persons in by_media.items()]


async def get_person_media_page(
    db: aiosqlite.Connection,
    person_id: int,
    cursor_id: int | None = None,
    cursor_value: str | None = None,
    limit: int = 50,
    sort: str = "desc",
    faces: FacesFilter | None = None,
) -> list[dict]:
    """Get media items containing a specific person's face."""
    conditions = [
        "hidden_at IS NULL",
        "id IN (SELECT media_id FROM faces WHERE person_id = :person_id)",
    ]
    params: dict = {"person_id": person_id}

    _apply_faces_filter(conditions, faces)

    sd = sort.upper()
    return await _paginate_media(
        db,
        conditions,
        params,
        cursor_id=cursor_id,
        cursor_value=cursor_value,
        cursor_column="date",
        limit=limit,
        order_by=f"date {sd}, id {sd}",
        sort_dir=sd,
    )


async def get_person_media_ids(
    db: aiosqlite.Connection,
    person_id: int,
    faces: FacesFilter | None = None,
    sort: str = "desc",
) -> list[int]:
    conditions = [
        "hidden_at IS NULL",
        "id IN (SELECT media_id FROM faces WHERE person_id = :person_id)",
    ]
    params: dict = {"person_id": person_id}
    _apply_faces_filter(conditions, faces)

    where = " AND ".join(conditions)
    sd = sort.upper()
    async with await db.execute(
        f"SELECT id FROM media_items WHERE {where} ORDER BY date {sd}, id {sd}",
        params,
    ) as cursor:
        rows = await cursor.fetchall()
    return [row[0] for row in rows]


async def get_face_scan_state(db: aiosqlite.Connection) -> dict:
    async with await db.execute("SELECT * FROM face_scan_state WHERE id = 1") as cursor:
        row = await cursor.fetchone()
    if not row:
        return {"status": "idle", "scanned_count": 0, "total_count": 0}
    return dict(row)


_SCAN_STATE_FIELDS = frozenset(
    {
        "status",
        "scanned_count",
        "total_count",
        "last_scanned_media_id",
        "last_error",
    }
)


async def update_face_scan_state(db: aiosqlite.Connection, **kwargs) -> None:
    invalid = set(kwargs.keys()) - _SCAN_STATE_FIELDS
    if invalid:
        raise ValueError(f"Invalid face_scan_state fields: {invalid}")
    async with await db.execute("SELECT id FROM face_scan_state WHERE id = 1") as cursor:
        row = await cursor.fetchone()
    now = utc_now_iso()
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


async def get_person_embeddings(db: aiosqlite.Connection) -> list[dict]:
    """Fetch representative face embedding for each person."""
    async with await db.execute(
        """SELECT p.id as person_id, f.embedding
           FROM persons p
           JOIN faces f ON f.id = p.representative_face_id
           WHERE p.representative_face_id IS NOT NULL"""
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_person_count(db: aiosqlite.Connection) -> int:
    async with await db.execute("SELECT COUNT(*) FROM persons") as cursor:
        row = await cursor.fetchone()
    return row[0] if row else 0


# ── Settings export/import ──────────────────────────────────────────


async def export_settings(db: aiosqlite.Connection) -> dict:
    """Export all user curation settings as a versioned dict."""
    hidden_groups = [
        {"chat_id": r["id"], "hidden_at": r["hidden_at"]}
        async for r in await db.execute(
            "SELECT id, hidden_at FROM dialogs WHERE hidden_at IS NOT NULL"
        )
    ]
    inactive_groups = [
        {"chat_id": r["chat_id"]}
        async for r in await db.execute(
            "SELECT chat_id FROM sync_state WHERE active = 0"
        )
    ]
    hidden_media = [
        {"message_id": r["message_id"], "chat_id": r["chat_id"], "hidden_at": r["hidden_at"]}
        async for r in await db.execute(
            "SELECT message_id, chat_id, hidden_at FROM media_items WHERE hidden_at IS NOT NULL"
        )
    ]
    favorited_media = [
        {"message_id": r["message_id"], "chat_id": r["chat_id"], "favorited_at": r["favorited_at"]}
        async for r in await db.execute(
            "SELECT message_id, chat_id, favorited_at FROM media_items WHERE favorited_at IS NOT NULL"
        )
    ]
    person_names = [
        {"person_id": r["id"], "name": r["name"]}
        async for r in await db.execute(
            "SELECT id, name FROM persons WHERE name IS NOT NULL"
        )
    ]
    return {
        "version": 1,
        "exported_at": utc_now_iso(),
        "hidden_groups": hidden_groups,
        "inactive_groups": inactive_groups,
        "hidden_media": hidden_media,
        "favorited_media": favorited_media,
        "person_names": person_names,
    }


async def import_settings(db: aiosqlite.Connection, data: dict) -> dict:
    """Merge imported settings into the database. Additive only."""
    applied = {"hidden_groups": 0, "inactive_groups": 0, "hidden_media": 0, "favorited_media": 0, "person_names": 0}
    skipped = {"unknown_ids": 0, "already_set": 0}

    for item in data.get("hidden_groups", []):
        async with await db.execute("SELECT hidden_at FROM dialogs WHERE id = ?", [item["chat_id"]]) as cursor:
            row = await cursor.fetchone()
        if not row:
            skipped["unknown_ids"] += 1
        elif row["hidden_at"]:
            skipped["already_set"] += 1
        else:
            await db.execute("UPDATE dialogs SET hidden_at = ? WHERE id = ?", [item["hidden_at"], item["chat_id"]])
            applied["hidden_groups"] += 1

    for item in data.get("inactive_groups", []):
        async with await db.execute("SELECT active FROM sync_state WHERE chat_id = ?", [item["chat_id"]]) as cursor:
            row = await cursor.fetchone()
        if not row:
            skipped["unknown_ids"] += 1
        elif row["active"] == 0:
            skipped["already_set"] += 1
        else:
            await db.execute("UPDATE sync_state SET active = 0 WHERE chat_id = ?", [item["chat_id"]])
            applied["inactive_groups"] += 1

    for item in data.get("hidden_media", []):
        async with await db.execute(
            "SELECT hidden_at FROM media_items WHERE message_id = ? AND chat_id = ?",
            [item["message_id"], item["chat_id"]],
        ) as cursor:
            row = await cursor.fetchone()
        if not row:
            skipped["unknown_ids"] += 1
        elif row["hidden_at"]:
            skipped["already_set"] += 1
        else:
            await db.execute(
                "UPDATE media_items SET hidden_at = ? WHERE message_id = ? AND chat_id = ?",
                [item["hidden_at"], item["message_id"], item["chat_id"]],
            )
            applied["hidden_media"] += 1

    for item in data.get("favorited_media", []):
        async with await db.execute(
            "SELECT favorited_at FROM media_items WHERE message_id = ? AND chat_id = ?",
            [item["message_id"], item["chat_id"]],
        ) as cursor:
            row = await cursor.fetchone()
        if not row:
            skipped["unknown_ids"] += 1
        elif row["favorited_at"]:
            skipped["already_set"] += 1
        else:
            await db.execute(
                "UPDATE media_items SET favorited_at = ? WHERE message_id = ? AND chat_id = ?",
                [item["favorited_at"], item["message_id"], item["chat_id"]],
            )
            applied["favorited_media"] += 1

    for item in data.get("person_names", []):
        async with await db.execute("SELECT name FROM persons WHERE id = ?", [item["person_id"]]) as cursor:
            row = await cursor.fetchone()
        if not row:
            skipped["unknown_ids"] += 1
        elif row["name"]:
            skipped["already_set"] += 1
        else:
            await db.execute("UPDATE persons SET name = ? WHERE id = ?", [item["name"], item["person_id"]])
            applied["person_names"] += 1

    await db.commit()
    return {"applied": applied, "skipped": skipped}


# endregion


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
