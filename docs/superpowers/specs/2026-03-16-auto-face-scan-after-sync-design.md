# Auto-Trigger Face Scan After Sync

## Context

Face scanning is currently manual — users must click "Scan Faces" after syncing media. This adds friction since every sync of new photos should logically trigger a face scan. The goal is to automatically start an incremental face scan after each chat sync completes, so new faces are detected without user intervention.

## Design

### Approach

After `_run_sync()` finishes indexing a chat successfully, fire off an incremental face scan in the background — but only if no scan is already running. This is a single integration point in `routes/groups.py`.

### Changes

**`backend/routes/groups.py` — `_run_sync()`**

1. Add `bg_tasks: set[asyncio.Task]` parameter to `_run_sync()`
2. After the sync completes successfully (after setting status to "done"), call a new helper `maybe_start_face_scan(db, tg, bg_tasks)`
3. Update callers (`sync_group`, `sync_all`) to pass `bg_tasks` through

**`backend/routes/faces.py` — extract `maybe_start_face_scan()`**

Extract the "check if scan is running, start if not" logic from `start_scan()` into a reusable async function:

```python
async def maybe_start_face_scan(
    db: aiosqlite.Connection,
    tg: TelegramClientWrapper,
    bg_tasks: set[asyncio.Task],
) -> bool:
    """Start an incremental face scan if one isn't already running. Returns True if started."""
    state = await get_face_scan_state(db)
    if state.get("status") in ("scanning", "clustering"):
        scan_running = any(
            not t.done() and t.get_name().startswith("face_scan")
            for t in bg_tasks
        )
        if scan_running:
            return False
        await update_face_scan_state(db, status="idle")
    task = fire_and_forget(_run_scan(db, tg, force=False), bg_tasks)
    task.set_name("face_scan")
    return True
```

Then `start_scan()` endpoint calls `maybe_start_face_scan()` internally (DRY).

### What stays the same

- Frontend: no changes. `useFaceScan` already polls scan status and shows progress. Auto-triggered scans appear identically to manual ones.
- Face scanner: no changes. `scan_faces()` is already incremental (only processes `faces_scanned = 0` photos).
- Scan state lifecycle: unchanged (idle → scanning → clustering → done).

### Edge cases

- **Scan already running**: `maybe_start_face_scan()` returns False, no duplicate scan.
- **Sync fails**: Face scan not triggered (only runs in the success path).
- **Multiple chats syncing**: First to finish triggers the scan. Others see scan already running and skip. The running scan picks up all unscanned photos regardless of which chat they came from.
- **No new photos**: `scan_faces()` finds 0 unscanned photos, transitions idle → scanning → clustering → done quickly.

## Files to modify

| File | Change |
|------|--------|
| `backend/routes/faces.py` | Extract `maybe_start_face_scan()` from `start_scan()` |
| `backend/routes/groups.py` | Add `bg_tasks` param to `_run_sync()`, call `maybe_start_face_scan()` after sync success |

## Verification

1. Start dev server: `cd backend && uv run fastapi dev`
2. Trigger a sync via UI or `POST /groups/{chat_id}/sync`
3. Observe that face scan starts automatically (check `GET /faces/scan-status`)
4. Trigger another sync while scan is running — verify no duplicate scan starts
5. Verify manual "Scan Faces" button still works
6. Verify `sync-all` with multiple chats triggers exactly one scan
