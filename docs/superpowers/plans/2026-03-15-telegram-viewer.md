# Telegram Media Viewer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web app that connects to Telegram, indexes media from selected groups, and presents it in a unified date-grouped gallery.

**Architecture:** Single-process FastAPI backend with Telethon for Telegram API access, SQLite for metadata, and a React SPA frontend (Vite + TypeScript). Thumbnails cached locally, full files streamed on demand.

**Tech Stack:** Python 3.11+, FastAPI, Telethon, SQLite (aiosqlite), React 18, TypeScript, Vite

**Spec:** `docs/superpowers/specs/2026-03-15-telegram-viewer-design.md`

---

## Chunk 1: Backend Foundation

### Task 1: Python Project Setup

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/main.py`
- Create: `backend/routes/__init__.py`
- Create: `backend/.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# Python
__pycache__/
*.pyc
*.pyo
.venv/
*.egg-info/

# Telethon
*.session

# App
backend/cache/
backend/*.db

# Env
.env

# Node
node_modules/
dist/
```

- [ ] **Step 2: Create `backend/pyproject.toml`**

```toml
[project]
name = "telegram-viewer"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "telethon>=1.37",
    "aiosqlite>=0.20",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 3: Create `backend/.env.example`**

Telethon requires a Telegram API ID and hash from https://my.telegram.org.

```
TELEGRAM_API_ID=your_api_id_here
TELEGRAM_API_HASH=your_api_hash_here
```

- [ ] **Step 4: Create `backend/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Telegram Media Viewer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Create `backend/routes/__init__.py`**

Empty file.

- [ ] **Step 6: Install dependencies and verify**

```bash
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

- [ ] **Step 7: Verify server starts**

```bash
cd backend && source .venv/bin/activate
uvicorn main:app --reload --port 8000 &
curl http://localhost:8000/health
# Expected: {"status":"ok"}
kill %1
```

- [ ] **Step 8: Commit**

```bash
git add .gitignore backend/pyproject.toml backend/main.py backend/routes/__init__.py backend/.env.example
git commit -m "feat: backend project setup with FastAPI"
```

---

### Task 2: Database Layer

**Files:**
- Create: `backend/database.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_database.py`

- [ ] **Step 1: Write failing tests for database**

Create `backend/tests/__init__.py` (empty).

Create `backend/tests/test_database.py`:

```python
import pytest
import aiosqlite
from database import init_db, insert_media_item, get_media_page, upsert_sync_state, get_sync_state

DB_PATH = ":memory:"


@pytest.fixture
async def db():
    conn = await aiosqlite.connect(DB_PATH)
    await init_db(conn)
    yield conn
    await conn.close()


@pytest.mark.asyncio
async def test_init_db_creates_tables(db):
    cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [row[0] for row in await cursor.fetchall()]
    assert "media_items" in tables
    assert "sync_state" in tables


@pytest.mark.asyncio
async def test_insert_and_query_media(db):
    item = {
        "message_id": 100,
        "chat_id": 1,
        "chat_name": "Test Group",
        "date": "2026-03-15T10:00:00",
        "media_type": "photo",
        "mime_type": "image/jpeg",
        "file_size": 50000,
        "width": 800,
        "height": 600,
        "duration": None,
        "caption": "test photo",
        "file_id": 12345,
        "access_hash": 67890,
        "file_ref": b"ref123",
        "thumbnail_path": None,
    }
    await insert_media_item(db, item)
    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1
    assert rows[0]["message_id"] == 100
    assert rows[0]["chat_name"] == "Test Group"


@pytest.mark.asyncio
async def test_cursor_pagination(db):
    for i in range(5):
        await insert_media_item(db, {
            "message_id": i,
            "chat_id": 1,
            "chat_name": "G",
            "date": f"2026-03-{15 - i}T10:00:00",
            "media_type": "photo",
            "mime_type": "image/jpeg",
            "file_size": 100,
            "width": 100,
            "height": 100,
            "duration": None,
            "caption": None,
            "file_id": i,
            "access_hash": i,
            "file_ref": b"ref",
            "thumbnail_path": None,
        })
    page1 = await get_media_page(db, cursor_id=None, limit=3)
    assert len(page1) == 3
    last_id = page1[-1]["id"]
    page2 = await get_media_page(db, cursor_id=last_id, limit=3)
    assert len(page2) == 2


@pytest.mark.asyncio
async def test_filter_by_groups(db):
    for chat_id in [1, 2]:
        await insert_media_item(db, {
            "message_id": chat_id * 10,
            "chat_id": chat_id,
            "chat_name": f"G{chat_id}",
            "date": "2026-03-15T10:00:00",
            "media_type": "photo",
            "mime_type": "image/jpeg",
            "file_size": 100,
            "width": 100,
            "height": 100,
            "duration": None,
            "caption": None,
            "file_id": chat_id,
            "access_hash": chat_id,
            "file_ref": b"ref",
            "thumbnail_path": None,
        })
    rows = await get_media_page(db, cursor_id=None, limit=10, group_ids=[1])
    assert len(rows) == 1
    assert rows[0]["chat_id"] == 1


@pytest.mark.asyncio
async def test_filter_by_media_type(db):
    for mtype in ["photo", "video"]:
        await insert_media_item(db, {
            "message_id": hash(mtype) % 10000,
            "chat_id": 1,
            "chat_name": "G",
            "date": "2026-03-15T10:00:00",
            "media_type": mtype,
            "mime_type": f"{'image' if mtype == 'photo' else 'video'}/mp4",
            "file_size": 100,
            "width": 100,
            "height": 100,
            "duration": 10.0 if mtype == "video" else None,
            "caption": None,
            "file_id": hash(mtype) % 10000,
            "access_hash": 1,
            "file_ref": b"ref",
            "thumbnail_path": None,
        })
    rows = await get_media_page(db, cursor_id=None, limit=10, media_type="video")
    assert len(rows) == 1
    assert rows[0]["media_type"] == "video"


@pytest.mark.asyncio
async def test_sync_state_upsert_and_get(db):
    await upsert_sync_state(db, chat_id=1, chat_name="Test", active=True, last_msg_id=500)
    state = await get_sync_state(db, chat_id=1)
    assert state["active"] == 1
    assert state["last_msg_id"] == 500
    # Update
    await upsert_sync_state(db, chat_id=1, chat_name="Test", active=True, last_msg_id=600)
    state = await get_sync_state(db, chat_id=1)
    assert state["last_msg_id"] == 600


@pytest.mark.asyncio
async def test_duplicate_media_ignored(db):
    item = {
        "message_id": 100,
        "chat_id": 1,
        "chat_name": "G",
        "date": "2026-03-15T10:00:00",
        "media_type": "photo",
        "mime_type": "image/jpeg",
        "file_size": 100,
        "width": 100,
        "height": 100,
        "duration": None,
        "caption": None,
        "file_id": 1,
        "access_hash": 1,
        "file_ref": b"ref",
        "thumbnail_path": None,
    }
    await insert_media_item(db, item)
    await insert_media_item(db, item)  # should not raise
    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_database.py -v
# Expected: FAIL — cannot import database functions
```

- [ ] **Step 3: Implement `backend/database.py`**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_database.py -v
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add backend/database.py backend/tests/
git commit -m "feat: database layer with SQLite schema and queries"
```

---

### Task 3: Telegram Client Wrapper

**Files:**
- Create: `backend/telegram_client.py`
- Create: `backend/tests/test_telegram_client.py`

This wraps Telethon with auth management and a concurrency semaphore. Tests use mocks since we can't hit the real Telegram API.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_telegram_client.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from telegram_client import TelegramClientWrapper


@pytest.fixture
def mock_telethon():
    with patch("telegram_client.TelegramClient") as MockClient:
        client = AsyncMock()
        MockClient.return_value = client
        client.is_connected.return_value = False
        yield client


@pytest.mark.asyncio
async def test_is_authenticated_no_session(mock_telethon):
    mock_telethon.is_user_authorized.return_value = False
    wrapper = TelegramClientWrapper(api_id=123, api_hash="abc", session_path="test")
    await wrapper.connect()
    result = await wrapper.is_authenticated()
    assert result is False


@pytest.mark.asyncio
async def test_is_authenticated_with_session(mock_telethon):
    mock_telethon.is_user_authorized.return_value = True
    wrapper = TelegramClientWrapper(api_id=123, api_hash="abc", session_path="test")
    await wrapper.connect()
    result = await wrapper.is_authenticated()
    assert result is True


@pytest.mark.asyncio
async def test_send_code(mock_telethon):
    mock_telethon.send_code_request.return_value = MagicMock(phone_code_hash="hash123")
    wrapper = TelegramClientWrapper(api_id=123, api_hash="abc", session_path="test")
    await wrapper.connect()
    result = await wrapper.send_code("+1234567890")
    assert result == "hash123"
    mock_telethon.send_code_request.assert_called_once_with("+1234567890")


@pytest.mark.asyncio
async def test_verify_code(mock_telethon):
    mock_telethon.sign_in.return_value = MagicMock()
    wrapper = TelegramClientWrapper(api_id=123, api_hash="abc", session_path="test")
    await wrapper.connect()
    await wrapper.verify_code("+1234567890", "12345", "hash123")
    mock_telethon.sign_in.assert_called_once_with(
        phone="+1234567890", code="12345", phone_code_hash="hash123"
    )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_telegram_client.py -v
# Expected: FAIL — cannot import TelegramClientWrapper
```

- [ ] **Step 3: Implement `backend/telegram_client.py`**

```python
from __future__ import annotations

import asyncio
import os
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError


class TelegramClientWrapper:
    def __init__(self, api_id: int, api_hash: str, session_path: str = "tg_session"):
        self._client = TelegramClient(session_path, api_id, api_hash)
        self._semaphore = asyncio.Semaphore(3)  # limit concurrent Telegram requests

    @property
    def client(self) -> TelegramClient:
        return self._client

    async def connect(self) -> None:
        if not self._client.is_connected():
            await self._client.connect()

    async def disconnect(self) -> None:
        await self._client.disconnect()

    async def is_authenticated(self) -> bool:
        return await self._client.is_user_authorized()

    async def send_code(self, phone: str) -> str:
        result = await self._client.send_code_request(phone)
        return result.phone_code_hash

    async def verify_code(
        self, phone: str, code: str, phone_code_hash: str, password: str | None = None
    ) -> None:
        try:
            await self._client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            if password is None:
                raise
            await self._client.sign_in(password=password)

    async def logout(self) -> None:
        await self._client.log_out()

    async def get_dialogs(self) -> list[dict]:
        dialogs = await self._client.get_dialogs()
        return [
            {
                "id": d.id,
                "name": d.name,
                "type": _dialog_type(d),
                "unread_count": d.unread_count,
            }
            for d in dialogs
        ]

    async def acquire_semaphore(self):
        await self._semaphore.acquire()

    def release_semaphore(self):
        self._semaphore.release()


def _dialog_type(dialog) -> str:
    if dialog.is_user:
        return "dm"
    if dialog.is_group:
        return "group"
    if dialog.is_channel:
        return "channel"
    return "other"
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_telegram_client.py -v
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add backend/telegram_client.py backend/tests/test_telegram_client.py
git commit -m "feat: Telegram client wrapper with auth and semaphore"
```

---

### Task 4: Indexer

**Files:**
- Create: `backend/indexer.py`
- Create: `backend/tests/test_indexer.py`

The indexer scans a chat's history, extracts media metadata, and stores it in SQLite. It supports incremental sync.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_indexer.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
import aiosqlite
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
from database import init_db, get_media_page, get_sync_state
from indexer import index_chat


def make_photo_message(msg_id: int, date: str):
    msg = MagicMock()
    msg.id = msg_id
    msg.date = date
    msg.text = "caption"
    msg.media = MagicMock(spec=MessageMediaPhoto)
    msg.photo = MagicMock()
    msg.photo.id = msg_id * 10
    msg.photo.access_hash = msg_id * 100
    msg.photo.file_reference = b"ref"
    msg.photo.sizes = [MagicMock(type="s", w=100, h=100), MagicMock(type="m", w=320, h=320)]
    msg.document = None
    msg.file = MagicMock()
    msg.file.mime_type = "image/jpeg"
    msg.file.size = 50000
    return msg


def make_video_message(msg_id: int, date: str):
    msg = MagicMock()
    msg.id = msg_id
    msg.date = date
    msg.text = ""
    msg.media = MagicMock(spec=MessageMediaDocument)
    msg.photo = None
    msg.document = MagicMock()
    msg.document.id = msg_id * 10
    msg.document.access_hash = msg_id * 100
    msg.document.file_reference = b"ref"
    msg.document.thumbs = [MagicMock()]
    msg.document.attributes = [MagicMock(w=1920, h=1080, duration=30)]
    msg.file = MagicMock()
    msg.file.mime_type = "video/mp4"
    msg.file.size = 5000000
    return msg


@pytest.fixture
async def db():
    conn = await aiosqlite.connect(":memory:")
    await init_db(conn)
    yield conn
    await conn.close()


@pytest.mark.asyncio
async def test_index_chat_photos(db):
    client = AsyncMock()
    messages = [make_photo_message(1, "2026-03-15T10:00:00")]
    client.client.iter_messages = MagicMock(return_value=AsyncIterator(messages))
    client.acquire_semaphore = AsyncMock()
    client.release_semaphore = MagicMock()

    progress = []
    async for p, t in index_chat(client, db, chat_id=1, chat_name="Test"):
        progress.append((p, t))

    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1
    assert rows[0]["media_type"] == "photo"
    assert rows[0]["width"] == 320  # uses largest PhotoSize


@pytest.mark.asyncio
async def test_index_chat_incremental(db):
    """Second sync should only fetch new messages."""
    client = AsyncMock()
    messages = [make_photo_message(2, "2026-03-16T10:00:00")]
    client.client.iter_messages = MagicMock(return_value=AsyncIterator(messages))
    client.acquire_semaphore = AsyncMock()
    client.release_semaphore = MagicMock()

    # First sync
    async for _ in index_chat(client, db, chat_id=1, chat_name="Test"):
        pass

    # Check sync state was saved
    state = await get_sync_state(db, chat_id=1)
    assert state["last_msg_id"] == 2

    # Second sync with no new messages
    client.client.iter_messages = MagicMock(return_value=AsyncIterator([]))
    async for _ in index_chat(client, db, chat_id=1, chat_name="Test"):
        pass

    rows = await get_media_page(db, cursor_id=None, limit=10)
    assert len(rows) == 1  # no duplicates


class AsyncIterator:
    """Helper to make a list behave as an async iterator."""
    def __init__(self, items):
        self._items = items
        self._total = MagicMock(return_value=len(items))

    def __aiter__(self):
        self._iter = iter(self._items)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_indexer.py -v
# Expected: FAIL — cannot import index_chat
```

- [ ] **Step 3: Implement `backend/indexer.py`**

```python
from __future__ import annotations

from typing import AsyncGenerator
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
from telegram_client import TelegramClientWrapper
import aiosqlite
from database import insert_media_item, upsert_sync_state, get_sync_state


async def index_chat(
    tg: TelegramClientWrapper,
    db: aiosqlite.Connection,
    chat_id: int,
    chat_name: str,
) -> AsyncGenerator[tuple[int, int], None]:
    """Index media from a chat. Yields (progress, total) tuples."""
    state = await get_sync_state(db, chat_id)
    min_id = state["last_msg_id"] if state else 0

    # Collect messages with media
    messages = []
    async for msg in tg.client.iter_messages(chat_id, min_id=min_id):
        if msg.media and isinstance(msg.media, (MessageMediaPhoto, MessageMediaDocument)):
            item = _extract_media(msg, chat_id, chat_name)
            if item:
                messages.append((msg, item))

    total = len(messages)
    if total == 0:
        yield (0, 0)
        return

    max_msg_id = min_id
    for i, (msg, item) in enumerate(messages):
        await insert_media_item(db, item)
        max_msg_id = max(max_msg_id, msg.id)
        yield (i + 1, total)

    await upsert_sync_state(db, chat_id=chat_id, chat_name=chat_name, active=True, last_msg_id=max_msg_id)


def _extract_media(msg, chat_id: int, chat_name: str) -> dict | None:
    """Extract media metadata from a Telegram message."""
    if isinstance(msg.media, MessageMediaPhoto) and msg.photo:
        sizes = msg.photo.sizes if msg.photo.sizes else []
        # Pick largest non-stripped size for dimensions
        best = _best_photo_size(sizes)
        w = getattr(best, "w", None) if best else None
        h = getattr(best, "h", None) if best else None
        return {
            "message_id": msg.id,
            "chat_id": chat_id,
            "chat_name": chat_name,
            "date": str(msg.date),
            "media_type": "photo",
            "mime_type": getattr(msg.file, "mime_type", "image/jpeg") if msg.file else "image/jpeg",
            "file_size": getattr(msg.file, "size", None) if msg.file else None,
            "width": w,
            "height": h,
            "duration": None,
            "caption": msg.text or None,
            "file_id": msg.photo.id,
            "access_hash": msg.photo.access_hash,
            "file_ref": msg.photo.file_reference,
            "thumbnail_path": None,
        }

    if isinstance(msg.media, MessageMediaDocument) and msg.document:
        mime = getattr(msg.file, "mime_type", "") if msg.file else ""
        if not (mime.startswith("image/") or mime.startswith("video/")):
            return None

        media_type = "video" if mime.startswith("video/") else "photo"
        w, h, duration = _document_dimensions(msg.document)

        return {
            "message_id": msg.id,
            "chat_id": chat_id,
            "chat_name": chat_name,
            "date": str(msg.date),
            "media_type": media_type,
            "mime_type": mime,
            "file_size": getattr(msg.file, "size", None) if msg.file else None,
            "width": w,
            "height": h,
            "duration": duration,
            "caption": msg.text or None,
            "file_id": msg.document.id,
            "access_hash": msg.document.access_hash,
            "file_ref": msg.document.file_reference,
            "thumbnail_path": None,
        }

    return None


def _best_photo_size(sizes) -> object | None:
    """Pick the largest PhotoSize that has width/height."""
    candidates = [s for s in sizes if hasattr(s, "w") and hasattr(s, "h")]
    if not candidates:
        return None
    return max(candidates, key=lambda s: s.w * s.h)


def _document_dimensions(doc) -> tuple[int | None, int | None, float | None]:
    """Extract w, h, duration from document attributes."""
    w = h = None
    duration = None
    for attr in (doc.attributes or []):
        if hasattr(attr, "w") and hasattr(attr, "h"):
            w = attr.w
            h = attr.h
        if hasattr(attr, "duration"):
            duration = attr.duration
    return w, h, duration
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_indexer.py -v
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add backend/indexer.py backend/tests/test_indexer.py
git commit -m "feat: media indexer with incremental sync"
```

---

## Chunk 2: Backend API Routes

### Task 5: Auth Routes

**Files:**
- Create: `backend/routes/auth.py`
- Create: `backend/tests/test_routes_auth.py`
- Modify: `backend/main.py` — register auth router

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_routes_auth.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture
def mock_tg():
    with patch("routes.auth.get_tg") as mock:
        tg = AsyncMock()
        mock.return_value = tg
        yield tg


@pytest.mark.asyncio
async def test_auth_status_not_authenticated(mock_tg):
    mock_tg.is_authenticated.return_value = False
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/auth/status")
    assert resp.status_code == 200
    assert resp.json() == {"authenticated": False}


@pytest.mark.asyncio
async def test_auth_status_authenticated(mock_tg):
    mock_tg.is_authenticated.return_value = True
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/auth/status")
    assert resp.status_code == 200
    assert resp.json() == {"authenticated": True}


@pytest.mark.asyncio
async def test_send_code(mock_tg):
    mock_tg.send_code.return_value = "hash123"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/auth/send-code", json={"phone": "+1234567890"})
    assert resp.status_code == 200
    assert resp.json() == {"phone_code_hash": "hash123"}


@pytest.mark.asyncio
async def test_verify_code(mock_tg):
    mock_tg.verify_code = AsyncMock()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/auth/verify", json={
            "phone": "+1234567890",
            "code": "12345",
            "phone_code_hash": "hash123",
        })
    assert resp.status_code == 200
    assert resp.json() == {"success": True}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_routes_auth.py -v
# Expected: FAIL
```

- [ ] **Step 3: Implement `backend/routes/auth.py`**

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

# This will be set by main.py at startup
_tg = None


def set_tg(tg):
    global _tg
    _tg = tg


def get_tg():
    return _tg


class SendCodeRequest(BaseModel):
    phone: str


class VerifyRequest(BaseModel):
    phone: str
    code: str
    phone_code_hash: str
    password: str | None = None


@router.get("/status")
async def auth_status():
    tg = get_tg()
    authenticated = await tg.is_authenticated()
    return {"authenticated": authenticated}


@router.post("/send-code")
async def send_code(req: SendCodeRequest):
    tg = get_tg()
    phone_code_hash = await tg.send_code(req.phone)
    return {"phone_code_hash": phone_code_hash}


@router.post("/verify")
async def verify(req: VerifyRequest):
    tg = get_tg()
    try:
        await tg.verify_code(req.phone, req.code, req.phone_code_hash, req.password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True}


@router.post("/logout")
async def logout():
    tg = get_tg()
    await tg.logout()
    return {"success": True}
```

- [ ] **Step 4: Register router in `backend/main.py`**

Replace `backend/main.py` with:

```python
from contextlib import asynccontextmanager
import os

import aiosqlite
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from telethon.errors import AuthKeyError

from database import init_db
from routes.auth import router as auth_router, set_tg
from telegram_client import TelegramClientWrapper

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "telegram_viewer.db")


@asynccontextmanager
async def lifespan(app: FastAPI):
    api_id = int(os.getenv("TELEGRAM_API_ID", "0"))
    api_hash = os.getenv("TELEGRAM_API_HASH", "")

    # Init database
    db = await aiosqlite.connect(DB_PATH)
    await init_db(db)
    app.state.db = db

    # Init Telegram client
    tg = TelegramClientWrapper(api_id=api_id, api_hash=api_hash)
    await tg.connect()
    app.state.tg = tg
    set_tg(tg)

    yield

    await db.close()
    await tg.disconnect()


app = FastAPI(title="Telegram Media Viewer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AuthKeyError)
async def auth_key_error_handler(request: Request, exc: AuthKeyError):
    return JSONResponse(status_code=401, content={"detail": "Session invalid or revoked"})


app.include_router(auth_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_routes_auth.py -v
# Expected: all PASS
```

- [ ] **Step 6: Commit**

```bash
git add backend/routes/auth.py backend/main.py backend/tests/test_routes_auth.py
git commit -m "feat: auth API routes (status, send-code, verify, logout)"
```

---

### Task 6: Groups Routes

**Files:**
- Create: `backend/routes/groups.py`
- Create: `backend/tests/test_routes_groups.py`
- Modify: `backend/main.py` — register groups router

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_routes_groups.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture
def mock_tg():
    with patch("routes.groups.get_tg") as mock:
        tg = AsyncMock()
        mock.return_value = tg
        yield tg


@pytest.fixture
def mock_db():
    with patch("routes.groups.get_db") as mock:
        db = AsyncMock()
        mock.return_value = db
        yield db


@pytest.mark.asyncio
async def test_list_groups(mock_tg, mock_db):
    mock_tg.get_dialogs.return_value = [
        {"id": 1, "name": "Group1", "type": "group", "unread_count": 0},
        {"id": 2, "name": "Channel1", "type": "channel", "unread_count": 5},
    ]
    mock_db.return_value = None  # no sync state

    with patch("routes.groups.get_sync_state", new_callable=AsyncMock, return_value=None):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/groups")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["name"] == "Group1"


@pytest.mark.asyncio
async def test_toggle_group_active(mock_tg, mock_db):
    with patch("routes.groups.upsert_sync_state", new_callable=AsyncMock) as mock_upsert:
        with patch("routes.groups.get_tg") as m_tg:
            m_tg.return_value = mock_tg
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch("/groups/1/active", json={"active": True, "chat_name": "Test"})
    assert resp.status_code == 200
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_routes_groups.py -v
# Expected: FAIL
```

- [ ] **Step 3: Implement `backend/routes/groups.py`**

```python
from __future__ import annotations

import asyncio
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import upsert_sync_state, get_sync_state, get_all_sync_states
from indexer import index_chat

router = APIRouter(prefix="/groups", tags=["groups"])

_tg = None
_db = None
_sync_status: dict[int, dict] = {}  # chat_id -> {status, progress, total}


def set_tg(tg):
    global _tg
    _tg = tg


def get_tg():
    return _tg


def set_db(db):
    global _db
    _db = db


def get_db():
    return _db


class ToggleActiveRequest(BaseModel):
    active: bool
    chat_name: str


@router.get("")
async def list_groups():
    tg = get_tg()
    db = get_db()
    dialogs = await tg.get_dialogs()
    # Enrich with sync state
    for d in dialogs:
        state = await get_sync_state(db, d["id"])
        d["active"] = bool(state and state["active"]) if state else False
        d["last_synced"] = state["last_synced"] if state else None
    return dialogs


@router.patch("/{chat_id}/active")
async def toggle_active(chat_id: int, req: ToggleActiveRequest):
    db = get_db()
    await upsert_sync_state(db, chat_id=chat_id, chat_name=req.chat_name, active=req.active)
    return {"success": True}


@router.post("/{chat_id}/sync")
async def sync_group(chat_id: int):
    tg = get_tg()
    db = get_db()

    state = await get_sync_state(db, chat_id)
    chat_name = state["chat_name"] if state else str(chat_id)

    _sync_status[chat_id] = {"status": "syncing", "progress": 0, "total": 0}

    async def event_stream():
        try:
            async for progress, total in index_chat(tg, db, chat_id, chat_name):
                _sync_status[chat_id] = {"status": "syncing", "progress": progress, "total": total}
                yield f"data: {{\"progress\": {progress}, \"total\": {total}}}\n\n"
            _sync_status[chat_id] = {"status": "done", "progress": 0, "total": 0}
            yield f"data: {{\"status\": \"done\"}}\n\n"
        except Exception as e:
            _sync_status[chat_id] = {"status": "error", "progress": 0, "total": 0}
            yield f"data: {{\"status\": \"error\", \"error\": \"{str(e)}\"}}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/{chat_id}/sync-status")
async def sync_status(chat_id: int):
    return _sync_status.get(chat_id, {"status": "idle", "progress": 0, "total": 0})
```

- [ ] **Step 4: Register router in `backend/main.py`**

Add to `backend/main.py` imports:

```python
from routes.groups import router as groups_router, set_tg as set_groups_tg, set_db as set_groups_db
```

In the lifespan, after `set_tg(tg)`:

```python
    set_groups_tg(tg)
    set_groups_db(db)
```

After `app.include_router(auth_router)`:

```python
app.include_router(groups_router)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_routes_groups.py -v
# Expected: all PASS
```

- [ ] **Step 6: Commit**

```bash
git add backend/routes/groups.py backend/tests/test_routes_groups.py backend/main.py
git commit -m "feat: groups API routes (list, toggle, sync with SSE)"
```

---

### Task 7: Media Routes

**Files:**
- Create: `backend/routes/media.py`
- Create: `backend/tests/test_routes_media.py`
- Modify: `backend/main.py` — register media router

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_routes_media.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch
import aiosqlite
from httpx import AsyncClient, ASGITransport
from main import app
from database import init_db, insert_media_item


@pytest.fixture
async def seeded_db():
    db = await aiosqlite.connect(":memory:")
    await init_db(db)
    for i in range(3):
        await insert_media_item(db, {
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
        })
    yield db
    await db.close()


@pytest.mark.asyncio
async def test_list_media(seeded_db):
    with patch("routes.media.get_db", return_value=seeded_db):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/media?limit=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert "next_cursor" in data


@pytest.mark.asyncio
async def test_list_media_with_cursor(seeded_db):
    with patch("routes.media.get_db", return_value=seeded_db):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp1 = await client.get("/media?limit=2")
            cursor = resp1.json()["next_cursor"]
            resp2 = await client.get(f"/media?limit=2&cursor={cursor}")
    data2 = resp2.json()
    assert len(data2["items"]) == 1
    assert data2["next_cursor"] is None


@pytest.mark.asyncio
async def test_list_media_filter_type(seeded_db):
    # Add a video
    await insert_media_item(seeded_db, {
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
    })
    with patch("routes.media.get_db", return_value=seeded_db):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/media?type=video")
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["media_type"] == "video"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_routes_media.py -v
# Expected: FAIL
```

- [ ] **Step 3: Implement `backend/routes/media.py`**

```python
from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse

from database import get_media_page, get_media_by_id, update_file_ref

router = APIRouter(prefix="/media", tags=["media"])

_db = None
_tg = None
CACHE_DIR = Path(__file__).parent.parent / "cache"


def set_db(db):
    global _db
    _db = db


def get_db():
    return _db


def set_tg(tg):
    global _tg
    _tg = tg


def get_tg():
    return _tg


@router.get("")
async def list_media(
    cursor: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    groups: str | None = Query(None),
    type: str | None = Query(None),
):
    db = get_db()
    group_ids = [int(g) for g in groups.split(",")] if groups else None
    items = await get_media_page(db, cursor_id=cursor, limit=limit, group_ids=group_ids, media_type=type)
    next_cursor = items[-1]["id"] if len(items) == limit else None
    return {"items": items, "next_cursor": next_cursor}


@router.get("/{media_id}/thumbnail")
async def get_thumbnail(media_id: int):
    db = get_db()
    item = await get_media_by_id(db, media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check local cache
    if item["thumbnail_path"] and Path(item["thumbnail_path"]).exists():
        return FileResponse(item["thumbnail_path"], media_type=item.get("mime_type", "image/jpeg"))

    # Download from Telegram
    tg = get_tg()
    try:
        thumb_bytes = await _download_thumbnail(tg, item)
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch thumbnail from Telegram")

    if thumb_bytes is None:
        raise HTTPException(status_code=404, detail="No thumbnail available")

    # Cache locally
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    thumb_path = CACHE_DIR / f"{media_id}.jpg"
    thumb_path.write_bytes(thumb_bytes)

    # Update DB
    await db.execute("UPDATE media_items SET thumbnail_path = ? WHERE id = ?", (str(thumb_path), media_id))
    await db.commit()

    return FileResponse(str(thumb_path), media_type="image/jpeg")


@router.get("/{media_id}/download")
async def download_media(media_id: int):
    db = get_db()
    item = await get_media_by_id(db, media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")

    tg = get_tg()

    async def stream():
        await tg.acquire_semaphore()
        try:
            async for chunk in tg.client.iter_download(
                await _get_input_location(tg, item),
                chunk_size=512 * 1024,
            ):
                yield chunk
        finally:
            tg.release_semaphore()

    mime = item.get("mime_type", "application/octet-stream")
    return StreamingResponse(stream(), media_type=mime)


async def _download_thumbnail(tg, item: dict) -> bytes | None:
    """Download the smallest photo size or document thumb."""
    from telethon.tl.types import InputPhotoFileLocation, InputDocumentFileLocation
    from telethon.errors import FileReferenceExpiredError

    await tg.acquire_semaphore()
    try:
        try:
            return await tg.client.download_media(
                await _get_input_location(tg, item),
                bytes,
                thumb=-1,  # smallest thumb
            )
        except FileReferenceExpiredError:
            await _refresh_file_ref(tg, item)
            return await tg.client.download_media(
                await _get_input_location(tg, item),
                bytes,
                thumb=-1,
            )
    finally:
        tg.release_semaphore()


async def _get_input_location(tg, item: dict):
    """Get the Telegram input location for downloading."""
    from telethon.tl.types import InputPhotoFileLocation, InputDocumentFileLocation

    if item["media_type"] == "photo":
        return InputPhotoFileLocation(
            id=item["file_id"],
            access_hash=item["access_hash"],
            file_reference=item["file_ref"],
            thumb_size="",
        )
    return InputDocumentFileLocation(
        id=item["file_id"],
        access_hash=item["access_hash"],
        file_reference=item["file_ref"],
        thumb_size="",
    )


async def _refresh_file_ref(tg, item: dict) -> None:
    """Re-fetch the message to get a fresh file reference."""
    db = get_db()
    msg = await tg.client.get_messages(item["chat_id"], ids=item["message_id"])
    if msg and msg.media:
        if msg.photo:
            new_ref = msg.photo.file_reference
        elif msg.document:
            new_ref = msg.document.file_reference
        else:
            return
        item["file_ref"] = new_ref
        await update_file_ref(db, item["id"], new_ref)
```

- [ ] **Step 4: Register router in `backend/main.py`**

Add to imports:

```python
from routes.media import router as media_router, set_tg as set_media_tg, set_db as set_media_db
```

In lifespan after the groups setup:

```python
    set_media_tg(tg)
    set_media_db(db)
```

After the groups router include:

```python
app.include_router(media_router)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/test_routes_media.py -v
# Expected: all PASS
```

- [ ] **Step 6: Commit**

```bash
git add backend/routes/media.py backend/tests/test_routes_media.py backend/main.py
git commit -m "feat: media API routes (list, thumbnail, download with file ref refresh)"
```

---

## Chunk 3: Frontend Foundation

### Task 8: React Project Setup

**Files:**
- Create: `frontend/` (via Vite scaffold)
- Modify: `frontend/vite.config.ts` — add dev proxy
- Modify: `frontend/src/App.tsx` — clean starter

- [ ] **Step 1: Scaffold React project with Vite**

```bash
cd /Users/wenjie/projects/telegram-viewer
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
```

- [ ] **Step 2: Configure Vite dev proxy**

Replace `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

- [ ] **Step 3: Clean up `frontend/src/App.tsx`**

```tsx
import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [status, setStatus] = useState<string>('loading...')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus('error'))
  }, [])

  return (
    <div>
      <h1>Telegram Media Viewer</h1>
      <p>Backend: {status}</p>
    </div>
  )
}

export default App
```

- [ ] **Step 4: Clean up `frontend/src/App.css`**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a1a;
  color: #e0e0e0;
}
```

- [ ] **Step 5: Verify frontend builds**

```bash
cd frontend && npm run build
# Expected: successful build in dist/
```

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: frontend project setup with Vite + React + dev proxy"
```

---

### Task 9: API Client Layer

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/types.ts`

- [ ] **Step 1: Create `frontend/src/api/types.ts`**

```typescript
export interface AuthStatus {
  authenticated: boolean
}

export interface Group {
  id: number
  name: string
  type: string
  unread_count: number
  active: boolean
  last_synced: string | null
}

export interface MediaItem {
  id: number
  message_id: number
  chat_id: number
  chat_name: string
  date: string
  media_type: 'photo' | 'video' | 'file'
  mime_type: string | null
  file_size: number | null
  width: number | null
  height: number | null
  duration: number | null
  caption: string | null
  thumbnail_path: string | null
}

export interface MediaPage {
  items: MediaItem[]
  next_cursor: number | null
}

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'done' | 'error'
  progress: number
  total: number
}
```

- [ ] **Step 2: Create `frontend/src/api/client.ts`**

```typescript
import type { AuthStatus, Group, MediaPage, SyncStatus } from './types'

const BASE = '/api'

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, init)
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`)
  }
  return resp.json()
}

// Auth
export const getAuthStatus = () => fetchJSON<AuthStatus>('/auth/status')

export const sendCode = (phone: string) =>
  fetchJSON<{ phone_code_hash: string }>('/auth/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })

export const verifyCode = (phone: string, code: string, phone_code_hash: string, password?: string) =>
  fetchJSON<{ success: boolean }>('/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, phone_code_hash, password }),
  })

export const logout = () =>
  fetchJSON<{ success: boolean }>('/auth/logout', { method: 'POST' })

// Groups
export const getGroups = () => fetchJSON<Group[]>('/groups')

export const toggleGroupActive = (chatId: number, active: boolean, chatName: string) =>
  fetchJSON<{ success: boolean }>(`/groups/${chatId}/active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active, chat_name: chatName }),
  })

export const syncGroup = async (chatId: number, onProgress?: (progress: number, total: number) => void) => {
  const resp = await fetch(`${BASE}/groups/${chatId}/sync`, { method: 'POST' })
  const reader = resp.body?.getReader()
  const decoder = new TextDecoder()
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      const match = text.match(/"progress":\s*(\d+),\s*"total":\s*(\d+)/)
      if (match && onProgress) onProgress(Number(match[1]), Number(match[2]))
    }
  }
}

export const getSyncStatus = (chatId: number) =>
  fetchJSON<SyncStatus>(`/groups/${chatId}/sync-status`)

// Media
export const getMedia = (params: {
  cursor?: number
  limit?: number
  groups?: number[]
  type?: string
}) => {
  const searchParams = new URLSearchParams()
  if (params.cursor) searchParams.set('cursor', String(params.cursor))
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.groups?.length) searchParams.set('groups', params.groups.join(','))
  if (params.type) searchParams.set('type', params.type)
  return fetchJSON<MediaPage>(`/media?${searchParams}`)
}

export const getThumbnailUrl = (mediaId: number) => `${BASE}/media/${mediaId}/thumbnail`

export const getDownloadUrl = (mediaId: number) => `${BASE}/media/${mediaId}/download`
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/
git commit -m "feat: frontend API client and type definitions"
```

---

### Task 10: AuthFlow Component

**Files:**
- Create: `frontend/src/components/AuthFlow.tsx`
- Create: `frontend/src/components/AuthFlow.css`

- [ ] **Step 1: Create `frontend/src/components/AuthFlow.css`**

```css
.auth-flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
}

.auth-flow h1 {
  margin-bottom: 2rem;
  font-size: 1.5rem;
}

.auth-flow form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 320px;
}

.auth-flow input {
  padding: 0.75rem;
  border: 1px solid #444;
  border-radius: 6px;
  background: #2a2a2a;
  color: #e0e0e0;
  font-size: 1rem;
}

.auth-flow button {
  padding: 0.75rem;
  border: none;
  border-radius: 6px;
  background: #0088cc;
  color: white;
  font-size: 1rem;
  cursor: pointer;
}

.auth-flow button:hover {
  background: #006daa;
}

.auth-flow .error {
  color: #ff6b6b;
  font-size: 0.875rem;
}
```

- [ ] **Step 2: Create `frontend/src/components/AuthFlow.tsx`**

```tsx
import { useState } from 'react'
import { sendCode, verifyCode } from '../api/client'
import './AuthFlow.css'

interface Props {
  onAuthenticated: () => void
}

type Step = 'phone' | 'code' | 'password'

export default function AuthFlow({ onAuthenticated }: Props) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [phoneCodeHash, setPhoneCodeHash] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await sendCode(phone)
      setPhoneCodeHash(result.phone_code_hash)
      setStep('code')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await verifyCode(phone, code, phoneCodeHash, password || undefined)
      onAuthenticated()
    } catch (err) {
      const msg = String(err)
      if (msg.includes('password') || msg.includes('2FA')) {
        setStep('password')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await verifyCode(phone, code, phoneCodeHash, password)
      onAuthenticated()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-flow">
      <h1>Telegram Media Viewer</h1>

      {step === 'phone' && (
        <form onSubmit={handleSendCode}>
          <input
            type="tel"
            placeholder="+1234567890"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Code'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={handleVerifyCode}>
          <p>Enter the code sent to {phone}</p>
          <input
            type="text"
            placeholder="12345"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handlePassword}>
          <p>Enter your 2FA password</p>
          <input
            type="password"
            placeholder="2FA Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Submit'}
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AuthFlow.tsx frontend/src/components/AuthFlow.css
git commit -m "feat: AuthFlow component (phone, code, 2FA steps)"
```

---

## Chunk 4: Frontend Main UI

### Task 11: Sidebar Component

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/components/Sidebar.css`
- Create: `frontend/src/hooks/useGroups.ts`

- [ ] **Step 1: Create `frontend/src/hooks/useGroups.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { Group } from '../api/types'
import { getGroups, toggleGroupActive } from '../api/client'

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getGroups()
      setGroups(data)
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const toggleActive = async (group: Group) => {
    const newActive = !group.active
    await toggleGroupActive(group.id, newActive, group.name)
    setGroups((prev) =>
      prev.map((g) => (g.id === group.id ? { ...g, active: newActive } : g))
    )
  }

  const activeGroupIds = groups.filter((g) => g.active).map((g) => g.id)

  return { groups, loading, error, toggleActive, activeGroupIds, refetch: fetchGroups }
}
```

- [ ] **Step 2: Create `frontend/src/components/Sidebar.css`**

```css
.sidebar {
  width: 280px;
  min-width: 280px;
  background: #222;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow-y: auto;
}

.sidebar h2 {
  padding: 1rem;
  font-size: 1rem;
  border-bottom: 1px solid #333;
}

.sidebar .groups-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.sidebar .group-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.sidebar .group-item:hover {
  background: #2a2a2a;
}

.sidebar .group-item input[type="checkbox"] {
  accent-color: #0088cc;
}

.sidebar .type-filter {
  display: flex;
  gap: 0.25rem;
  padding: 0.75rem;
  border-top: 1px solid #333;
}

.sidebar .type-filter button {
  flex: 1;
  padding: 0.4rem;
  border: 1px solid #444;
  border-radius: 4px;
  background: transparent;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 0.75rem;
}

.sidebar .type-filter button.active {
  background: #0088cc;
  border-color: #0088cc;
}

.sidebar .sync-btn {
  margin: 0.75rem;
  padding: 0.6rem;
  border: none;
  border-radius: 6px;
  background: #0088cc;
  color: white;
  cursor: pointer;
  font-size: 0.875rem;
}

.sidebar .sync-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Create `frontend/src/components/Sidebar.tsx`**

```tsx
import type { Group } from '../api/types'
import './Sidebar.css'

interface Props {
  groups: Group[]
  onToggleGroup: (group: Group) => void
  mediaTypeFilter: string | null
  onMediaTypeFilter: (type: string | null) => void
  onSync: () => void
  syncing: boolean
}

const TYPE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'Photos', value: 'photo' },
  { label: 'Videos', value: 'video' },
]

export default function Sidebar({
  groups,
  onToggleGroup,
  mediaTypeFilter,
  onMediaTypeFilter,
  onSync,
  syncing,
}: Props) {
  return (
    <aside className="sidebar">
      <h2>Groups</h2>
      <div className="groups-list">
        {groups.map((g) => (
          <label key={g.id} className="group-item">
            <input
              type="checkbox"
              checked={g.active}
              onChange={() => onToggleGroup(g)}
            />
            <span>{g.name}</span>
          </label>
        ))}
      </div>
      <div className="type-filter">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            className={mediaTypeFilter === opt.value ? 'active' : ''}
            onClick={() => onMediaTypeFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button className="sync-btn" onClick={onSync} disabled={syncing}>
        {syncing ? 'Syncing...' : 'Sync Active Groups'}
      </button>
    </aside>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useGroups.ts frontend/src/components/Sidebar.tsx frontend/src/components/Sidebar.css
git commit -m "feat: Sidebar component with group selector and media type filter"
```

---

### Task 12: MediaGrid + MediaCard Components

**Files:**
- Create: `frontend/src/hooks/useMedia.ts`
- Create: `frontend/src/components/MediaGrid.tsx`
- Create: `frontend/src/components/MediaGrid.css`
- Create: `frontend/src/components/MediaCard.tsx`
- Create: `frontend/src/components/DateHeader.tsx`

- [ ] **Step 1: Create `frontend/src/hooks/useMedia.ts`**

```typescript
import { useState, useCallback } from 'react'
import type { MediaItem } from '../api/types'
import { getMedia } from '../api/client'

export function useMedia() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMedia = useCallback(
    async (params: { groups?: number[]; type?: string; reset?: boolean }) => {
      setLoading(true)
      try {
        const cursor = params.reset ? undefined : (nextCursor ?? undefined)
        const data = await getMedia({
          cursor,
          limit: 50,
          groups: params.groups,
          type: params.type,
        })
        setItems((prev) => (params.reset ? data.items : [...prev, ...data.items]))
        setNextCursor(data.next_cursor)
        setError(null)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [nextCursor]
  )

  const reset = () => {
    setItems([])
    setNextCursor(null)
  }

  return { items, loading, error, hasMore: nextCursor !== null, fetchMedia, reset }
}
```

- [ ] **Step 2: Create `frontend/src/components/DateHeader.tsx`**

```tsx
interface Props {
  date: string
}

export default function DateHeader({ date }: Props) {
  const formatted = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return <h3 className="date-header">{formatted}</h3>
}
```

- [ ] **Step 3: Create `frontend/src/components/MediaCard.tsx`**

```tsx
import type { MediaItem } from '../api/types'
import { getThumbnailUrl } from '../api/client'

interface Props {
  item: MediaItem
  onClick: () => void
}

export default function MediaCard({ item, onClick }: Props) {
  const isVideo = item.media_type === 'video'

  return (
    <div className="media-card" onClick={onClick}>
      <img
        src={getThumbnailUrl(item.id)}
        alt={item.caption || ''}
        loading="lazy"
      />
      {isVideo && <div className="video-badge">&#9654;</div>}
      {isVideo && item.duration && (
        <div className="duration-badge">{formatDuration(item.duration)}</div>
      )}
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
```

- [ ] **Step 4: Create `frontend/src/components/MediaGrid.css`**

```css
.media-grid-container {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.date-header {
  font-size: 0.875rem;
  color: #888;
  padding: 0.5rem 0;
  margin-top: 1rem;
  border-bottom: 1px solid #333;
}

.date-header:first-child {
  margin-top: 0;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 4px;
  margin-top: 0.5rem;
}

.media-card {
  position: relative;
  aspect-ratio: 1;
  cursor: pointer;
  overflow: hidden;
  border-radius: 4px;
  background: #2a2a2a;
}

.media-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-card .video-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 2rem;
  color: white;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.7);
  pointer-events: none;
}

.media-card .duration-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 3px;
}

.load-more {
  display: block;
  margin: 1.5rem auto;
  padding: 0.6rem 2rem;
  border: 1px solid #444;
  border-radius: 6px;
  background: transparent;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 0.875rem;
}

.load-more:hover {
  background: #2a2a2a;
}
```

- [ ] **Step 5: Create `frontend/src/components/MediaGrid.tsx`**

```tsx
import type { MediaItem } from '../api/types'
import MediaCard from './MediaCard'
import DateHeader from './DateHeader'
import './MediaGrid.css'

interface Props {
  items: MediaItem[]
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
  onItemClick: (item: MediaItem) => void
}

export default function MediaGrid({ items, hasMore, loading, onLoadMore, onItemClick }: Props) {
  const grouped = groupByDate(items)

  if (items.length === 0 && !loading) {
    return (
      <div className="media-grid-container">
        <p style={{ textAlign: 'center', color: '#888', marginTop: '4rem' }}>
          No media found. Select some groups and sync to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="media-grid-container">
      {grouped.map(([date, dateItems]) => (
        <div key={date}>
          <DateHeader date={date} />
          <div className="media-grid">
            {dateItems.map((item) => (
              <MediaCard key={item.id} item={item} onClick={() => onItemClick(item)} />
            ))}
          </div>
        </div>
      ))}
      {hasMore && (
        <button className="load-more" onClick={onLoadMore} disabled={loading}>
          {loading ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  )
}

function groupByDate(items: MediaItem[]): [string, MediaItem[]][] {
  const map = new Map<string, MediaItem[]>()
  for (const item of items) {
    const date = item.date.split('T')[0]
    const existing = map.get(date)
    if (existing) {
      existing.push(item)
    } else {
      map.set(date, [item])
    }
  }
  return Array.from(map.entries())
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useMedia.ts frontend/src/components/DateHeader.tsx frontend/src/components/MediaCard.tsx frontend/src/components/MediaGrid.tsx frontend/src/components/MediaGrid.css
git commit -m "feat: MediaGrid, MediaCard, DateHeader components with date grouping"
```

---

### Task 13: Lightbox Component

**Files:**
- Create: `frontend/src/components/Lightbox.tsx`
- Create: `frontend/src/components/Lightbox.css`

- [ ] **Step 1: Create `frontend/src/components/Lightbox.css`**

```css
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.lightbox-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.lightbox-content img,
.lightbox-content video {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 4px;
}

.lightbox-close {
  position: absolute;
  top: -2rem;
  right: 0;
  background: none;
  border: none;
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
}

.lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: white;
  font-size: 2rem;
  padding: 1rem 0.75rem;
  cursor: pointer;
  border-radius: 4px;
}

.lightbox-nav.prev {
  left: -3.5rem;
}

.lightbox-nav.next {
  right: -3.5rem;
}

.lightbox-toolbar {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.75rem;
}

.lightbox-toolbar button {
  padding: 0.5rem 1.5rem;
  border: 1px solid #555;
  border-radius: 6px;
  background: transparent;
  color: white;
  cursor: pointer;
  font-size: 0.875rem;
}

.lightbox-toolbar button:hover {
  background: #333;
}

.lightbox-caption {
  text-align: center;
  color: #aaa;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}
```

- [ ] **Step 2: Create `frontend/src/components/Lightbox.tsx`**

```tsx
import { useEffect, useCallback } from 'react'
import type { MediaItem } from '../api/types'
import { getDownloadUrl, getThumbnailUrl } from '../api/client'
import './Lightbox.css'

interface Props {
  item: MediaItem
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
}

export default function Lightbox({ item, onClose, onPrev, onNext, hasPrev, hasNext }: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
    },
    [onClose, onPrev, onNext, hasPrev, hasNext]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const downloadUrl = getDownloadUrl(item.id)
  const isVideo = item.media_type === 'video'

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = ''
    a.click()
  }

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose}>
          &times;
        </button>

        {hasPrev && (
          <button className="lightbox-nav prev" onClick={onPrev}>
            &#8249;
          </button>
        )}
        {hasNext && (
          <button className="lightbox-nav next" onClick={onNext}>
            &#8250;
          </button>
        )}

        {isVideo ? (
          <video src={downloadUrl} controls autoPlay />
        ) : (
          <img src={downloadUrl} alt={item.caption || ''} />
        )}

        <div className="lightbox-toolbar">
          <button onClick={handleDownload}>Download</button>
        </div>

        {item.caption && <p className="lightbox-caption">{item.caption}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Lightbox.tsx frontend/src/components/Lightbox.css
git commit -m "feat: Lightbox component with keyboard nav and download"
```

---

### Task 14: Wire Up App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: Update `frontend/src/App.css`**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a1a;
  color: #e0e0e0;
}

.app-layout {
  display: flex;
  height: 100vh;
}
```

- [ ] **Step 2: Update `frontend/src/App.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { getAuthStatus, syncGroup } from './api/client'
import type { MediaItem } from './api/types'
import AuthFlow from './components/AuthFlow'
import Sidebar from './components/Sidebar'
import MediaGrid from './components/MediaGrid'
import Lightbox from './components/Lightbox'
import { useGroups } from './hooks/useGroups'
import { useMedia } from './hooks/useMedia'
import './App.css'

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [syncing, setSyncing] = useState(false)

  const { groups, toggleActive, activeGroupIds, refetch: refetchGroups } = useGroups()
  const { items, loading, hasMore, fetchMedia, reset } = useMedia()

  // Check auth on mount
  useEffect(() => {
    getAuthStatus()
      .then((s) => setAuthenticated(s.authenticated))
      .catch(() => setAuthenticated(false))
  }, [])

  // Fetch media when filters change
  useEffect(() => {
    if (!authenticated) return
    reset()
    fetchMedia({ groups: activeGroupIds, type: mediaTypeFilter ?? undefined, reset: true })
  }, [authenticated, activeGroupIds.join(','), mediaTypeFilter])

  const handleSync = async () => {
    setSyncing(true)
    for (const gid of activeGroupIds) {
      try {
        await syncGroup(gid)
      } catch {
        // continue syncing other groups
      }
    }
    setSyncing(false)
    reset()
    fetchMedia({ groups: activeGroupIds, type: mediaTypeFilter ?? undefined, reset: true })
  }

  const handleLoadMore = () => {
    fetchMedia({ groups: activeGroupIds, type: mediaTypeFilter ?? undefined })
  }

  // Lightbox navigation
  const selectedIndex = selectedItem ? items.findIndex((i) => i.id === selectedItem.id) : -1

  const handlePrev = () => {
    if (selectedIndex > 0) setSelectedItem(items[selectedIndex - 1])
  }
  const handleNext = () => {
    if (selectedIndex < items.length - 1) setSelectedItem(items[selectedIndex + 1])
  }

  if (authenticated === null) return null // loading
  if (!authenticated) return <AuthFlow onAuthenticated={() => setAuthenticated(true)} />

  return (
    <div className="app-layout">
      <Sidebar
        groups={groups}
        onToggleGroup={toggleActive}
        mediaTypeFilter={mediaTypeFilter}
        onMediaTypeFilter={setMediaTypeFilter}
        onSync={handleSync}
        syncing={syncing}
      />
      <MediaGrid
        items={items}
        hasMore={hasMore}
        loading={loading}
        onLoadMore={handleLoadMore}
        onItemClick={setSelectedItem}
      />
      {selectedItem && (
        <Lightbox
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onPrev={handlePrev}
          onNext={handleNext}
          hasPrev={selectedIndex > 0}
          hasNext={selectedIndex < items.length - 1}
        />
      )}
    </div>
  )
}

export default App
```

- [ ] **Step 3: Verify frontend builds**

```bash
cd frontend && npm run build
# Expected: successful build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.css
git commit -m "feat: wire up App with auth, sidebar, grid, and lightbox"
```

---

## Chunk 5: Integration & Polish

### Task 15: End-to-End Smoke Test

- [ ] **Step 1: Create `.env` from example**

```bash
cd backend
cp .env.example .env
# Edit .env with your actual TELEGRAM_API_ID and TELEGRAM_API_HASH from https://my.telegram.org
```

- [ ] **Step 2: Start backend**

```bash
cd backend && source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

- [ ] **Step 3: Start frontend (separate terminal)**

```bash
cd frontend && npm run dev
```

- [ ] **Step 4: Manual smoke test**

Open http://localhost:5173 in browser:
1. Auth flow should appear — enter phone, code, optional 2FA
2. After auth, sidebar should show your groups/channels
3. Check some groups, click "Sync Active Groups"
4. Media grid should populate with thumbnails grouped by date
5. Click a thumbnail — lightbox should open
6. Arrow keys should navigate between items
7. Download button should save the file

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: smoke test fixes"
```

### Task 16: Remove Vite Boilerplate

- [ ] **Step 1: Clean up unused Vite scaffold files**

Delete these if they still exist:
- `frontend/src/assets/react.svg`
- `frontend/public/vite.svg`
- Any remaining default Vite content in `index.html`

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove Vite scaffold boilerplate"
```
