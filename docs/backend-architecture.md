# Backend Architecture

## API Routes

**System:**
- `GET /health` — health check

**Auth** (`/auth`, 4 endpoints):
- `GET /status` — check if authenticated
- `POST /send-code` — send verification code to phone
- `POST /verify` — verify code + optional 2FA password
- `POST /logout`

**Groups** (`/groups`, 13 endpoints):
- `GET /` — list dialogs from DB cache (sorted by last message date), background refreshes from Telegram
- `POST /refresh` — trigger manual Telegram dialog refresh (202)
- `PATCH /{chat_id}/active` — toggle group active status
- `POST /{chat_id}/sync` — fire-and-forget, returns 202, launches background task
- `POST /sync-all` — accepts `{"chat_ids": [...]}`, launches parallel background syncs, returns 202
- `GET /{chat_id}/sync-status` — poll current sync status (idle/syncing/done/error with progress/total)
- `DELETE /{chat_id}/media` — clear indexed media + cached files for a single group
- `DELETE /media` — bulk clear all indexed media + cached files
- `GET /hidden` — list hidden groups (merges sync_state — returns same shape as `GET /`)
- `GET /hidden/count` — count hidden groups
- `POST /{chat_id}/hide` — hide a group (sets hidden_at)
- `POST /{chat_id}/unhide` — unhide a group (clears hidden_at)
- `POST /unhide-batch` — unhide multiple groups

**Media** (`/media`):
- `GET /` — cursor-paginated list (filters: groups, type, date_from, date_to; limit 1-200, default 50). Excludes hidden items.
- `POST /download-zip` — accepts `{media_ids: int[]}`, max 200 items, ensures cache, builds temp zip, streams FileResponse with BackgroundTask cleanup
- `GET /hidden` — paginated list of hidden items, sorted by hidden_at DESC
- `GET /hidden/count` — returns `{count: int}`
- `POST /unhide-batch` — accepts `{media_ids: int[]}`, unhides items
- `GET /favorites` — paginated list of favorited items, sorted by favorited_at DESC
- `GET /favorites/count` — returns `{count: int}`
- `POST /{media_id}/hide` — sets hidden_at timestamp
- `POST /{media_id}/unhide` — clears hidden_at
- `POST /hide-batch` — hide multiple items
- `POST /favorite-batch` — favorite multiple items
- `POST /{media_id}/favorite` — toggles favorited_at (sets or clears), returns `{success, favorited}`
- `GET /{media_id}/thumbnail` — cached locally on disk, fetched from Telegram on miss, HTTP Cache-Control headers (24h immutable)
- `GET /{media_id}/download` — cached locally on disk after first download, fetched from Telegram on miss, HTTP Cache-Control headers (24h immutable)

Note: Static routes (/hidden, /favorites, /unhide-batch, /download-zip) must be defined before /{media_id} parameterized routes.

## Database (SQLite via aiosqlite)

**media_items**: id (PK), message_id, chat_id, chat_name, date, media_type, mime_type, file_size, width, height, duration, caption, file_id, access_hash, file_ref (BLOB), thumbnail_path, download_path, hidden_at, favorited_at, sender_name. Unique on (message_id, chat_id). Indexes on date DESC, chat_id, media_type, hidden_at, favorited_at, (chat_id + date DESC).

**sync_state**: chat_id (PK), chat_name, active, last_msg_id, last_synced. Tracks per-group indexing progress.

**dialogs**: id (PK), name, type, unread_count, last_message_date, updated_at, hidden_at. DB-cached dialog metadata.

Schema init uses CREATE TABLE IF NOT EXISTS + try/catch ALTER TABLE for migrations.

## Telegram Client

Telethon wrapper (`TelegramClientWrapper`) with:
- asyncio.Semaphore(6) for concurrent request limiting
- 60s in-memory dialog cache + SQLite persistence via `dialogs` table
- Background refresh: `refresh_dialogs()` (lock-guarded, non-blocking) fetches from Telegram and upserts to DB
- Global `AuthKeyError` exception handler returns 401

## Media Handling

- Indexer uses three-pass server-side Telethon filters (photos, videos, documents — skips stickers/GIFs), batches of 100, checkpoints every 500, FloodWait resilience, yields SyncEvent dataclass (progress/done/error/flood_wait)
- Thumbnails: pre-downloaded during sync (cached as `{chat_id}_{message_id}.jpg` in `backend/cache/`), lazy-loaded from Telegram on miss
- Full files: cached locally on first download (`{media_id}_full.{ext}` in `backend/cache/`), download_path stored in DB
- file_ref refresh: re-fetches message to get fresh Telegram file reference when stale

## Key Modules

- `main.py` — FastAPI app, lifespan (init DB + TG client), CORS (localhost:3000), routers
- `database.py` — schema init, CRUD, pagination, sync state, hide/unhide/favorite queries
- `telegram_client.py` — Telethon wrapper with caching/semaphore
- `indexer.py` — media extraction, batch processing, SyncEvent generator
- `utils.py` — `fire_and_forget()` background task tracking with done-callback cleanup and error logging
- `deps.py` — FastAPI dependency injection (`get_db`, `get_tg`, `get_sync_status`, `get_background_tasks`)
- `routes/` — auth.py, groups.py, media.py
