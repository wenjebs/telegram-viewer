# Telegram Media Viewer — Design Spec

## Problem

Finding photos, videos, and files across Telegram requires browsing each group/channel individually. There is no unified gallery view.

## Solution

A local web app that connects to your Telegram account, indexes media metadata from selected groups, and presents it in a date-grouped grid gallery with group filtering.

## Architecture

Single-process Python backend (FastAPI + Telethon) with a React SPA frontend. SQLite for metadata storage. Local-only, single-user.

```
┌─────────────┐       ┌──────────────────────────────┐
│  React SPA  │◄─────►│  FastAPI Server               │
│  (Vite)     │  HTTP  │                               │
│             │       │  ├─ REST API (media, groups)   │
│  - Grid     │       │  ├─ Telethon client            │
│  - Filters  │       │  ├─ SQLite (metadata index)    │
│  - Lightbox │       │  └─ File cache (thumbnails)    │
└─────────────┘       └──────────────────────────────┘
```

### Data Flow

1. First run: authenticate with Telegram (phone number + code + optional 2FA)
2. Select which groups to index via the UI
3. Backend scans those groups, stores metadata in SQLite
4. Frontend fetches paginated media metadata, displays a date-grouped grid
5. Thumbnails fetched on demand through backend (proxied from Telegram, cached locally)
6. Click a media item to view full-size or download

## Backend

### Project Structure

```
backend/
├── main.py              # FastAPI app entry point
├── telegram_client.py   # Telethon session management + auth
├── indexer.py           # Scans chats, writes metadata to SQLite
├── database.py          # SQLite schema + queries
├── routes/
│   ├── auth.py          # Login flow (phone, code, 2FA)
│   ├── groups.py        # List groups, toggle active groups
│   └── media.py         # List media, thumbnails, downloads
└── cache/               # Local thumbnail cache
```

### Auth Flow

Telethon handles Telegram authentication. On first launch, the user provides their phone number, enters the verification code Telegram sends, and optionally provides a 2FA password. Telethon persists the session to a `.session` file so authentication is one-time.

The backend detects invalid/revoked sessions (`AuthKeyError`, `SessionRevokedError`) and returns a 401, prompting the frontend to re-enter the auth flow.

### Indexer

When a group is activated, the indexer scans its message history for:
- `MessageMediaPhoto` — compressed photos
- `MessageMediaDocument` — files, including photos/videos sent as files (filtered by MIME type: `image/*`, `video/*`)

Metadata is stored in SQLite. Re-indexing fetches only messages newer than the last indexed message for that group (incremental sync). The `sync_state` table tracks the last-indexed message ID per group.

Sync is serialized (one group at a time) to avoid Telegram rate limits (`FloodWaitError`). Thumbnail and download requests use a concurrency semaphore to prevent flood waits.

### SQLite Schema

```sql
CREATE TABLE media_items (
    id              INTEGER PRIMARY KEY,
    message_id      INTEGER NOT NULL,
    chat_id         INTEGER NOT NULL,
    chat_name       TEXT NOT NULL,
    date            DATETIME NOT NULL,
    media_type      TEXT NOT NULL,  -- 'photo', 'video', 'file'
    mime_type       TEXT,
    file_size       INTEGER,
    width           INTEGER,        -- pixels, for grid layout
    height          INTEGER,        -- pixels, for grid layout
    duration         REAL,           -- seconds, for video only
    caption         TEXT,
    file_id         INTEGER,        -- stable Telegram file ID
    access_hash     INTEGER,        -- stable Telegram access hash
    file_ref        BLOB,           -- expires; refreshed on FileReferenceExpiredError
    thumbnail_path  TEXT,           -- local cache path, nullable
    UNIQUE(message_id, chat_id)
);

CREATE TABLE sync_state (
    chat_id         INTEGER PRIMARY KEY,
    chat_name       TEXT NOT NULL,
    active          INTEGER NOT NULL DEFAULT 0,
    last_msg_id     INTEGER NOT NULL DEFAULT 0,
    last_synced     DATETIME
);

CREATE INDEX idx_media_date ON media_items(date DESC);
CREATE INDEX idx_media_chat ON media_items(chat_id);
CREATE INDEX idx_media_type ON media_items(media_type);
```

**File reference handling:** Telegram file references (`file_ref`) expire after hours to days. `file_id` and `access_hash` are stable. When a download or thumbnail fetch encounters `FileReferenceExpiredError`, the backend re-fetches the message to get a fresh `file_ref` and retries transparently.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/status` | Check if authenticated (`{ authenticated: boolean }`) |
| POST | `/auth/send-code` | Initiate Telegram login |
| POST | `/auth/verify` | Verify code + optional 2FA |
| POST | `/auth/logout` | Clear session, return to login |
| GET | `/groups` | List all dialogs (groups, channels, DMs) |
| PATCH | `/groups/{id}/active` | Toggle a group for indexing |
| POST | `/groups/{id}/sync` | Trigger indexing (returns SSE stream with progress) |
| GET | `/groups/{id}/sync-status` | Poll sync progress (`{ status, progress, total }`) |
| GET | `/media` | Cursor-based media list (`?cursor={id}&limit=50&groups=1,2&type=photo`) |
| GET | `/media/{id}/thumbnail` | Serve cached thumbnail |
| GET | `/media/{id}/download` | Stream full file from Telegram |

**Pagination:** Cursor-based using the last seen `id`. This avoids duplicates/gaps when new media is indexed during browsing.

**Sync progress:** `POST /groups/{id}/sync` returns an SSE stream with `{ progress, total }` events. The frontend can also poll `GET /groups/{id}/sync-status` as a fallback.

**Groups scope:** `GET /groups` returns all Telegram dialog types (groups, channels, DMs). The user selects which ones to index.

## Frontend

### Project Structure

```
frontend/
├── src/
│   ├── App.tsx
│   ├── api/                 # API client functions
│   ├── components/
│   │   ├── AuthFlow.tsx     # Login screens (phone → code → 2FA)
│   │   ├── Sidebar.tsx      # Group selector (checkboxes)
│   │   ├── MediaGrid.tsx    # Date-grouped photo/video grid
│   │   ├── MediaCard.tsx    # Single thumbnail with type badge
│   │   ├── Lightbox.tsx     # Full-size viewer with download button
│   │   └── DateHeader.tsx   # Date separator in the grid
│   └── hooks/
│       ├── useMedia.ts      # Fetch + paginate media
│       └── useGroups.ts     # Fetch + toggle groups
```

### Layout

```
┌──────────┬────────────────────────────────┐
│ Sidebar  │  Media Grid                    │
│          │                                │
│ ☑ Group1 │  ── March 15, 2026 ──────────  │
│ ☑ Group2 │  [img] [img] [vid] [img]      │
│ ☐ Group3 │  [img] [vid] [img]            │
│ ☑ Group4 │                                │
│          │  ── March 14, 2026 ──────────  │
│ Filter:  │  [img] [img] [img] [img]      │
│ All/Photo│  [vid] [img]                  │
│ /Video   │                                │
│          │                                │
│ [Sync]   │         [Load more...]         │
└──────────┴────────────────────────────────┘
```

### Interactions

- **Sidebar:** Checkboxes to toggle active groups. Media type filter (All / Photos / Videos / Files). Sync button triggers re-index for active groups.
- **Grid:** Responsive CSS grid of thumbnails grouped by date (newest first). Videos show a play icon badge. Pagination via infinite scroll or "load more" button.
- **Lightbox:** Click thumbnail to open full-size overlay. Arrow keys to navigate. Download button saves full file locally.

### Thumbnail Strategy

- **Photos:** Download the smallest `PhotoSize` (type `s` or `m`) as the thumbnail
- **Videos:** Use `Document.thumbs` attribute if available
- **Files with no thumbnail:** Serve a placeholder icon based on MIME type

### Tech Stack

- Vite + React + TypeScript
- CSS Grid for the gallery layout
- Vite dev proxy to FastAPI backend (avoids CORS during development)
- Minimal dependencies — no heavy UI framework

## Scale Assumptions

- Dozens of groups, thousands of media files
- SQLite is sufficient at this scale
- Thumbnails cached locally, full files streamed on demand

## Out of Scope

- Multi-user support
- Hosted/cloud deployment
- Forwarding/sharing media to other chats
- Stickers, voice messages, GIFs
- Full-text search across captions (could add later)
