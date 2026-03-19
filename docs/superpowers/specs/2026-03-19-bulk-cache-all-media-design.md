# Bulk Cache All Media

**Date**: 2026-03-19
**Status**: Approved

## Problem

Media only downloads on demand as the user scrolls or opens the lightbox. For large collections this means slow first-load times. Users want to pre-cache everything in the background — potentially overnight — so browsing is instant afterward.

## Solution

A backend-driven bulk caching job that downloads all uncached media (full-res + thumbnails) across all chats. The job is resumable across server restarts, yields to on-demand browsing requests, and exposes progress in the frontend.

## Design Decisions

- **One job at a time.** Starting while a job exists resumes it. Starting while a job is `paused` or `error` resumes/retries it. To start fresh, cancel first.
- **Backend-driven.** Survives tab close — critical for overnight use.
- **DB-persisted state.** Resumable across server restarts via a cursor.
- **Shared semaphore, polite backoff.** Bulk task yields when on-demand requests are active.
- **No separate concurrency budget.** Avoids Telegram rate limit risk.
- **Hidden items skipped.** Items with `hidden_at IS NOT NULL` are excluded — no point caching content the user hid.
- **`total_items` is a snapshot.** Taken at job creation. Progress may drift if media is synced/deleted mid-job; this is cosmetic and acceptable.

## Database Schema

```sql
CREATE TABLE cache_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'running',    -- running | paused | completed | cancelled | error
  total_items INTEGER NOT NULL DEFAULT 0,
  cached_items INTEGER NOT NULL DEFAULT 0,
  skipped_items INTEGER NOT NULL DEFAULT 0,  -- already cached when job started
  failed_items INTEGER NOT NULL DEFAULT 0,
  bytes_cached INTEGER NOT NULL DEFAULT 0,
  last_media_id INTEGER,                     -- resume cursor
  flood_wait_until TEXT,                     -- ISO timestamp if rate-limited, NULL otherwise
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT                                 -- terminal error message, only set when status='error'
);
```

Only one active job at a time. `last_media_id` is the cursor — on resume, query `WHERE id > last_media_id AND (download_path IS NULL OR thumbnail_path IS NULL) AND hidden_at IS NULL`.

## Backend API

Four endpoints under `/media/cache`:

### `POST /media/cache/start`

Start or resume bulk caching.

- If an active job exists (`running` / `paused` / `error`), resume it from `last_media_id`.
- Otherwise, count all uncached non-hidden items, create a new job row, kick off background task.
- Returns: `{ job_id, status, total_items, cached_items, skipped_items }`

### `GET /media/cache/status`

Poll current job progress.

- Returns the active job row, or the most recent completed/cancelled one if none active.
- If no job has ever been created, returns `null` (frontend treats as "no job" state).
- Frontend polls every 3s while running, stops when completed/paused.
- Returns: `{ job_id, status, total_items, cached_items, skipped_items, failed_items, bytes_cached, flood_wait_until, error } | null`

### `POST /media/cache/pause`

Pause the running job.

- Sets a flag the background task checks between items.
- Task finishes current download, then persists cursor and stops.
- User resumes later via `/start`.

### `POST /media/cache/cancel`

Cancel any active or paused job.

- Sets status to `cancelled`. The background task checks this flag and exits.
- Next `/start` call creates a fresh job.

## Background Task Loop

```
for each uncached item (ORDER BY id, WHERE id > last_media_id AND hidden_at IS NULL):
    if pause_requested or cancel_requested: save cursor, set status, return
    await _backoff_if_busy(tg)  # yield to on-demand browsing
    if download_path IS NULL:
        path = await _ensure_cached(tg, item)
        UPDATE media_items SET download_path = path WHERE id = item.id
    if thumbnail_path IS NULL:
        thumb = await _download_thumbnail(tg, item)
        if thumb: UPDATE media_items SET thumbnail_path = thumb WHERE id = item.id
    file_size = os.path.getsize(path) if path else 0
    update job row (cached_items++, last_media_id, bytes_cached += file_size, updated_at)
    sleep 200ms  # rate limit safety
```

### DB persistence after each download

`_ensure_cached` returns a path but does not persist `download_path` to the DB. The bulk loop must do this explicitly (same pattern as `_cache_and_persist` in the zip flow). Same for `_download_thumbnail` and `thumbnail_path`.

### `bytes_cached` tracking

After each item, `os.path.getsize()` on the downloaded file. This is cheap and accurate.

### Backoff strategy

`_backoff_if_busy(tg)`: expose `TelegramClientWrapper.available_slots() -> int` (wraps `self._semaphore._value`). The bulk loop calls this and backs off if < 3 slots are free:

```python
async def _backoff_if_busy(tg):
    while tg.available_slots() < 3:
        await asyncio.sleep(2)
```

This is a soft heuristic — the TOCTOU gap between checking and acquiring is acceptable because the consequence is just "bulk task runs slightly when it could have waited", not data corruption. The on-demand path doesn't backoff, so it always wins.

### FloodWaitError handling

On `FloodWaitError`: set `flood_wait_until` on the job row to the resume timestamp. Sleep for the requested duration. Clear `flood_wait_until` on wake. Frontend shows "Rate limited, resuming in Xs".

### Deduplication with `_download_registry`

The bulk loop does not need to interact with `_download_registry`. The `_ensure_cached` function already checks if a file exists on disk first, so if an on-demand request cached it in the meantime, the bulk loop skips it. No race risk — worst case is a redundant download, which the registry handles at the `_download_full` level.

## Frontend

### `useCacheJob` hook

Shared by both sidebar widget and settings panel.

- Polls `GET /media/cache/status` every 3s when job is `running`.
- Exposes: `{ job, start, pause, cancel, isRunning, isPaused, isCompleted }`
- Stops polling when `completed`, `paused`, or `cancelled`.
- Handles `null` response (no job ever created) as idle state.

### Sidebar Progress Widget

Positioned below the chat list, above settings icon.

| State | Display |
|-------|---------|
| No job / cancelled / completed (old) | Subtle "Cache all media" link |
| Running | Progress bar + "Caching... 1,204 / 3,500" + pause button |
| Running + flood wait | "Rate limited, resuming in 45s" |
| Paused | "Paused — 1,204 / 3,500" + resume button |
| Just completed | "All media cached" — subtle static text |

### Settings Panel — "Storage" Section

New section in SettingsPanel:

- **"Cache all media"** button — starts/resumes job.
- **Warning text**: "Downloads all media to the server. Best used when you're not actively browsing."
- **Stats** when job exists: item count + bytes cached.
- Pause/Resume/Cancel controls mirror sidebar.

## Concurrency & Prioritization

- Bulk task shares the existing `asyncio.Semaphore(6)` on `TelegramClientWrapper`.
- Before each download, checks `tg.available_slots()`. If < 3 slots free, backs off with 2s sleeps — on-demand requests from active browsing always get priority.
- 200ms delay between items even when idle to avoid hammering Telegram.
- On `FloodWaitError`: auto-sleep for the requested duration, then resume.

## Scope

- Downloads **all non-hidden media across all chats**.
- For each item: full-res media (`download_path`) and thumbnail (`thumbnail_path`).
- Reuses existing `_ensure_cached` and `_download_thumbnail` functions.
- No new download logic — just orchestration and persistence.
- Media synced during a running job may or may not be included (depends on whether its `id` falls after the cursor). This is acceptable — user can start a new job to catch stragglers.
