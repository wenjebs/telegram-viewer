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
"""


async def init_db(db: aiosqlite.Connection) -> None:
    await db.executescript(SCHEMA)
    db.row_factory = aiosqlite.Row
    # Migrations for columns added after initial schema
    for migration in [
        "ALTER TABLE dialogs ADD COLUMN last_message_date DATETIME",
        "ALTER TABLE media_items ADD COLUMN download_path TEXT",
    ]:
        try:
            await db.execute(migration)
        except sqlite3.OperationalError:
            pass  # Column already exists
    await db.commit()


async def insert_media_item(db: aiosqlite.Connection, item: dict) -> None:
    await db.execute(
        """INSERT OR IGNORE INTO media_items
        (message_id, chat_id, chat_name, date, media_type, mime_type,
         file_size, width, height, duration, caption, file_id, access_hash,
         file_ref, thumbnail_path)
        VALUES (:message_id, :chat_id, :chat_name, :date, :media_type, :mime_type,
                :file_size, :width, :height, :duration, :caption, :file_id,
                :access_hash, :file_ref, :thumbnail_path)""",
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
         file_ref, thumbnail_path)
        VALUES (:message_id, :chat_id, :chat_name, :date, :media_type, :mime_type,
                :file_size, :width, :height, :duration, :caption, :file_id,
                :access_hash, :file_ref, :thumbnail_path)""",
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


async def get_media_page(
    db: aiosqlite.Connection,
    cursor_id: int | None = None,
    limit: int = 50,
    group_ids: list[int] | None = None,
    media_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[dict]:
    conditions = []
    params: dict = {"limit": limit}

    if cursor_id is not None:
        conditions.append("id < :cursor_id")
        params["cursor_id"] = cursor_id

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

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"SELECT * FROM media_items {where} ORDER BY id DESC LIMIT :limit"

    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


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


async def get_media_by_id(db: aiosqlite.Connection, media_id: int) -> dict | None:
    cursor = await db.execute("SELECT * FROM media_items WHERE id = ?", (media_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


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
    """Fetch dialogs that have messages, ordered by most recent message first."""
    cursor = await db.execute(
        "SELECT * FROM dialogs WHERE last_message_date IS NOT NULL "
        "ORDER BY last_message_date DESC"
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]
