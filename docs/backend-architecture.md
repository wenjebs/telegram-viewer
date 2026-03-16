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
- `POST /download-zip` — (legacy sync) accepts `{media_ids: int[]}`, max 200 items, ensures cache, builds temp zip, returns FileResponse with BackgroundTask cleanup
- `POST /prepare-zip` — async zip: accepts `{media_ids: int[]}`, max 200, validates, fires background job, returns 202 `{job_id}`. Background task downloads uncached files (with per-file progress), then builds zip with ZIP_STORED for media
- `GET /zip-status/{job_id}` — poll zip job progress `{status, files_ready, files_total, error}`. Status: preparing → zipping → done | error
- `GET /zip-download/{job_id}` — download completed zip file, auto-cleans up job + temp file via BackgroundTask
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
- `GET /{media_id}/download` — cached locally on disk, fetched from Telegram on miss. Videos stream progressively via `StreamingResponse` + Telethon `iter_download` (tee-to-disk caching); non-videos buffer fully then return `FileResponse` (range request support). HTTP Cache-Control headers (24h immutable)

Note: Static routes (/hidden, /favorites, /unhide-batch, /download-zip, /prepare-zip, /zip-status, /zip-download) must be defined before /{media_id} parameterized routes.

**Faces** (`/faces`, 9 endpoints):
- `GET /scan-status` — returns `{status, scanned, total, person_count}`. Status: idle/scanning/clustering/done/error
- `POST /scan` — starts background face scan (InsightFace detection + DBSCAN clustering). `?force=true` clears all face data first. Returns 409 if scan already running
- `GET /persons` — list all detected persons with metadata (display_name, face_count, avatar_crop_path)
- `POST /persons/merge` — merge two persons: moves all faces from `merge_id` to `keep_id`
- `GET /persons/{person_id}` — single person with face count, representative face, avatar crop
- `PATCH /persons/{person_id}` — rename a person
- `DELETE /persons/{person_id}/faces/{face_id}` — remove a face from a person (unassign + decrement count)
- `GET /persons/{person_id}/media` — cursor-paginated media items containing a person's face
- `GET /{face_id}/crop` — JPEG face crop image (30% bbox expansion, 112x112 resize)

## Database (SQLite via aiosqlite)

**media_items**: id (PK), message_id, chat_id, chat_name, date, media_type, mime_type, file_size, width, height, duration, caption, file_id, access_hash, file_ref (BLOB), thumbnail_path, download_path, hidden_at, favorited_at, sender_name, faces_scanned. Unique on (message_id, chat_id). Indexes on date DESC, chat_id, media_type, hidden_at, favorited_at, (chat_id + date DESC).

**sync_state**: chat_id (PK), chat_name, active, last_msg_id, last_synced. Tracks per-group indexing progress.

**dialogs**: id (PK), name, type, unread_count, last_message_date, updated_at, hidden_at. DB-cached dialog metadata.

**persons**: id (PK), name, representative_face_id, face_count, created_at, updated_at. Detected face clusters.

**faces**: id (PK), media_id, person_id, embedding (BLOB), bbox_x/y/w/h (REAL, normalized 0-1), confidence, crop_path, created_at. Indexes on media_id, person_id.

**face_scan_state**: id (PK, singleton), status, scanned_count, total_count, last_scanned_media_id, last_error, updated_at. Tracks face scan progress.

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
- Full files: cached locally on first download (`{media_id}_full.{ext}` in `backend/cache/`), download_path stored in DB. Videos stream progressively to the browser while simultaneously caching to a temp file (renamed on completion); non-videos buffer fully before responding
- file_ref refresh: re-fetches message to get fresh Telegram file reference when stale

## Face Recognition

- `face_scanner.py` — two-phase pipeline: (1) scan unscanned photos in batches of 20 using InsightFace `buffalo_l` model (CPU), detect faces, save 112x112 crops to `cache/faces/`; (2) cluster embeddings via DBSCAN (L2-normalized, eps=0.5, cosine metric, min_samples=2), create persons, select highest-confidence face as representative
- Face crops stored as `cache/faces/{face_id}.jpg` (JPEG quality=85, 30% bbox expansion)
- Progress tracked via `face_scan_state` table (status/scanned_count/total_count)
- Stale scan detection: resumes from `last_scanned_media_id` if interrupted

## Key Modules

- `main.py` — FastAPI app, lifespan (init DB + TG client), CORS (localhost:3000), routers
- `database.py` — schema init, CRUD, pagination, sync state, hide/unhide/favorite, face/person queries
- `telegram_client.py` — Telethon wrapper with caching/semaphore
- `indexer.py` — media extraction, batch processing, SyncEvent generator
- `face_scanner.py` — InsightFace detection + DBSCAN clustering pipeline
- `utils.py` — `fire_and_forget()` background task tracking with done-callback cleanup and error logging
- `deps.py` — FastAPI dependency injection (`get_db`, `get_tg`, `get_sync_status`, `get_background_tasks`, `get_zip_jobs`)
- `routes/` — auth.py, groups.py, media.py, faces.py
