from __future__ import annotations

import aiosqlite
from datetime import datetime, timezone

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
"""


async def init_db(db: aiosqlite.Connection) -> None:
    await db.executescript(SCHEMA)
    db.row_factory = aiosqlite.Row
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


async def get_media_page(
    db: aiosqlite.Connection,
    cursor_id: int | None = None,
    limit: int = 50,
    group_ids: list[int] | None = None,
    media_type: str | None = None,
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


async def update_file_ref(db: aiosqlite.Connection, media_id: int, file_ref: bytes) -> None:
    await db.execute("UPDATE media_items SET file_ref = ? WHERE id = ?", (file_ref, media_id))
    await db.commit()


async def get_media_by_id(db: aiosqlite.Connection, media_id: int) -> dict | None:
    cursor = await db.execute("SELECT * FROM media_items WHERE id = ?", (media_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None
