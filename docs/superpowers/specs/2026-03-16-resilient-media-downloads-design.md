# Resilient Media Downloads

**Date:** 2026-03-16
**Status:** Draft

## Problem

When scrolling fast or switching views, the frontend's `usePrefetch` hook aborts in-flight download requests (via `AbortController.abort()`). On the backend:

- **Non-video:** The `_download_full()` coroutine is awaited inside the request handler. Client disconnect causes a `CancelledError`, abandoning the Telegram download mid-way. Nothing gets cached.
- **Video:** The `StreamingResponse` generator stops being consumed. The `except BaseException` block fires, deleting the partially-written temp file.

Result: media that was partially downloaded gets thrown away and must restart from scratch on the next request.

## Goal

Once the backend starts downloading media from Telegram, it should **always finish and cache** the file, regardless of whether the client disconnects. No frontend changes needed.

## Design

### Download Registry

A module-level `dict[int, asyncio.Future[str]]` maps `media_id` to an in-flight download's result future. This deduplicates concurrent requests and lets downloads survive client disconnects.

**File:** `backend/routes/media.py`

```python
# Module-level registry
_download_registry: dict[int, asyncio.Future[str]] = {}


def _resolve_future(fut: asyncio.Future, task: asyncio.Task) -> None:
    """Bridge a Task's outcome to a Future so multiple awaiters can join."""
    if fut.done():
        return
    if task.cancelled():
        fut.cancel()
    elif exc := task.exception():
        fut.set_exception(exc)
    else:
        fut.set_result(task.result())
```

**Note on dependency scope:** Both `tg` (TelegramClientWrapper) and `db` (aiosqlite.Connection) are app-level singletons stored on `app.state` — they are NOT request-scoped and will not be closed when the HTTP request ends. Background tasks can safely use them.

**Note on race safety:** The check-and-insert pattern (`if media_id not in _download_registry` followed by insertion) is safe because it runs in a single asyncio event loop thread with no `await` between the check and insert — no preemption point exists.

### Core caching coroutine

Extract existing download + cache + DB-update logic into a standalone coroutine:

```python
async def _cache_media(tg, db, item: dict) -> str:
    """Download media from Telegram, write to cache, update DB. Returns cached file path."""
    media_id = item["id"]
    mime = item.get("mime_type", "application/octet-stream")
    data = await _download_full(tg, item)
    await asyncio.to_thread(CACHE_DIR.mkdir, parents=True, exist_ok=True)
    ext = mimetypes.guess_extension(mime) or ""
    download_path = CACHE_DIR / f"{media_id}_full{ext}"
    await asyncio.to_thread(download_path.write_bytes, data)
    await db.execute(
        "UPDATE media_items SET download_path = ? WHERE id = ?",
        (str(download_path), media_id),
    )
    await db.commit()
    return str(download_path)
```

### Updated endpoint flow (`GET /media/{id}/download`)

Add `bg_tasks: set[asyncio.Task] = Depends(get_background_tasks)` to the endpoint signature.

```
Request arrives for media_id
  1. Check disk cache (download_path exists) → FileResponse
  2. Check _download_registry[media_id] → if exists, await shield(fut) → FileResponse
  3. Not cached, no active task:
     a. Create Future, store in _download_registry[media_id]
     b. Create asyncio.Task via fire_and_forget(_cache_media(...), bg_tasks)
     c. Task's done-callback: resolve the Future, then remove entry from _download_registry
     d. await shield(fut) → FileResponse
  4. If client disconnects during await: task keeps running, file gets cached
```

**Key details:**
- Use `asyncio.shield()` so the await in the handler can be cancelled without cancelling the underlying task.
- Wrap the `await` in try/except to translate background task failures to proper HTTP errors (502 for Telegram failures, 404 if media gone).
- If `HTTPException` propagates from the background task, re-raise it directly.

### Video handling

Video keeps the current `StreamingResponse` for immediate playback. Change the error handling:

**Current behavior (bad):**
```python
except BaseException:
    f.close()
    tmp_path.unlink(missing_ok=True)  # Deletes partial download
    raise
```

**New behavior:**
```python
except BaseException:
    f.close()
    tmp_path.unlink(missing_ok=True)  # Delete partial temp file
    # Re-download fully in the background so the file gets cached
    if media_id not in _download_registry:
        fut = asyncio.get_event_loop().create_future()
        task = fire_and_forget(_cache_media(tg, db, item), bg_tasks)
        task.add_done_callback(lambda t: _resolve_future(fut, t))
        _download_registry[media_id] = fut
    raise
```

This ensures that even if a video stream is interrupted, the full file will be downloaded and cached in the background. The next request for the same video will either join the in-flight task or serve from cache.

### Reused existing patterns

- **`fire_and_forget(coro, task_set)`** from `backend/utils.py` — creates tracked background tasks with error logging and GC protection
- **`bg_tasks: set[asyncio.Task]`** from `app.state.background_tasks` via `deps.py:get_background_tasks` — existing task tracking infrastructure
- **`_download_full(tg, item)`** — existing Telegram download function with semaphore management

### Concurrency

- Telegram semaphore (6 concurrent) still governs all downloads — background tasks acquire it like any other
- No new concurrency limits needed
- Multiple HTTP requests for the same `media_id` deduplicate via the registry

## Files to Modify

| File | Changes |
|------|---------|
| `backend/routes/media.py` | Add `_download_registry`, extract `_cache_media()`, update `download_media()` endpoint, update `_stream_video()` error handling |

## Verification

1. Start the dev server: `cd backend && uv run fastapi dev`
2. Open the app, scroll through media to trigger prefetch downloads
3. While downloads are in-flight, quickly navigate away (switch groups or scroll past)
4. Check `backend/cache/` — files should appear even though the client disconnected
5. Navigate back — previously-downloading media should load instantly from cache
6. Test video: start playing a video, navigate away mid-playback, come back — video should be cached
7. Test deduplication: open the same uncached media in two tabs simultaneously — only one Telegram download should occur
8. Test failure: if a background download fails (e.g., media deleted from Telegram), verify the registry is cleaned up and subsequent requests get a proper error (not a hang)
