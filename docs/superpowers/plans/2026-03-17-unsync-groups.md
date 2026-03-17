# Unsync Groups Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to unsync a group — deleting all its downloaded media and resetting it to an inactive/unsynced state, accessible via an overflow menu (⋯) on each group row in the sidebar.

**Architecture:** New `POST /groups/{chat_id}/unsync` endpoint reuses the existing `clear_chat_media()` DB function, then deactivates the sync state. Frontend replaces the per-group hide button with a ⋯ overflow menu containing both "Hide" and "Unsync & delete media" actions.

**Tech Stack:** FastAPI (backend), React 19 + TanStack Query (frontend), Tailwind CSS v4

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `backend/database.py` | Add `deactivate_sync_state()` helper |
| Modify | `backend/routes/groups.py` | Add `POST /groups/{chat_id}/unsync` endpoint |
| Modify | `backend/tests/test_routes_groups.py` | Tests for unsync endpoint |
| Modify | `frontend/src/api/client.ts` | Add `unsyncGroup()` API function |
| Create | `frontend/src/components/GroupOverflowMenu.tsx` | Reusable ⋯ overflow menu component |
| Modify | `frontend/src/components/Sidebar.tsx` | Replace hide button with overflow menu |
| Modify | `frontend/src/hooks/useGroups.ts` | Add `unsyncGroup` handler |
| Modify | `frontend/src/routes/index.tsx` | Wire `onUnsyncGroup` prop to Sidebar |

---

### Task 1: Backend — `deactivate_sync_state` DB helper

**Files:**
- Modify: `backend/database.py` (after `upsert_sync_state` at line ~375)
- Modify: `backend/tests/test_routes_groups.py`

- [ ] **Step 1: Write the failing test**

First, add `get_sync_state` to the imports at the top of `backend/tests/test_routes_groups.py` (line 5):

```python
from database import upsert_sync_state, upsert_dialogs_batch, hide_dialog, get_sync_state
```

Then add to the end of the file:

```python
# ---------------------------------------------------------------------------
# Unsync
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unsync_group(mock_tg, real_db_app, mock_bg_tasks, mock_sync_status, client):
    """POST /groups/{id}/unsync clears media, deactivates group, returns success."""
    db = real_db_app
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "G1", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
    ])
    await upsert_sync_state(db, chat_id=1, chat_name="G1", active=True, last_msg_id=50)

    with patch("routes.groups.Path") as MockPath:
        mock_path_instance = MagicMock()
        MockPath.return_value = mock_path_instance
        resp = await client.post("/groups/1/unsync")
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # Verify group is now inactive with reset sync state
    state = await get_sync_state(db, 1)
    assert state["active"] == 0
    assert state["last_msg_id"] == 0
    assert state["last_synced"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_routes_groups.py::test_unsync_group -v`
Expected: FAIL (endpoint doesn't exist yet)

- [ ] **Step 3: Add `deactivate_sync_state` to database.py**

Add after the `get_all_sync_states` function (around line 395) in `backend/database.py`:

```python
async def deactivate_sync_state(db: aiosqlite.Connection, chat_id: int) -> None:
    """Set active=0 for a chat's sync state without touching last_synced."""
    await db.execute(
        "UPDATE sync_state SET active = 0 WHERE chat_id = ?", (chat_id,)
    )
    await db.commit()
```

- [ ] **Step 4: Commit**

```bash
git add backend/database.py backend/tests/test_routes_groups.py
git commit -m "feat: add deactivate_sync_state DB helper and unsync test skeleton"
```

---

### Task 2: Backend — `POST /groups/{chat_id}/unsync` endpoint

**Files:**
- Modify: `backend/routes/groups.py`

- [ ] **Step 1: Add the unsync endpoint**

Add the import for `deactivate_sync_state` to the imports at line 13-23 of `backend/routes/groups.py`:

```python
from database import (
    upsert_sync_state,
    get_sync_state,
    get_all_sync_states,
    get_all_dialogs,
    clear_chat_media,
    clear_all_media,
    hide_dialog,
    unhide_dialogs,
    get_hidden_dialogs,
    get_hidden_dialog_count,
    deactivate_sync_state,
)
```

Add the endpoint after the `unhide_group` route (after line 183) in `backend/routes/groups.py`:

```python
@router.post("/{chat_id}/unsync")
async def unsync_group(
    chat_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    sync_status: dict[int, dict] = Depends(get_sync_status),
):
    """Unsync a group: delete all media, reset sync state, deactivate."""
    current = sync_status.get(chat_id, {})
    if current.get("status") == "syncing":
        return JSONResponse(
            status_code=409,
            content={"detail": "Cannot unsync while sync is in progress"},
        )

    paths = await clear_chat_media(db, chat_id)
    await deactivate_sync_state(db, chat_id)
    for p in paths:
        await asyncio.to_thread(Path(p).unlink, missing_ok=True)
    _preview_cache.pop(chat_id, None)
    sync_status.pop(chat_id, None)
    return {"success": True}
```

- [ ] **Step 2: Run the test from Task 1 to verify it passes**

Run: `cd backend && uv run pytest tests/test_routes_groups.py::test_unsync_group -v`
Expected: PASS

- [ ] **Step 3: Write and run the 409 test**

Add to `backend/tests/test_routes_groups.py`:

```python
@pytest.mark.asyncio
async def test_unsync_group_409_during_sync(mock_tg, mock_db, mock_bg_tasks, mock_sync_status, client):
    """POST /groups/{id}/unsync returns 409 when sync is in progress."""
    mock_sync_status[1] = {"status": "syncing", "progress": 5, "total": 10}
    resp = await client.post("/groups/1/unsync")
    assert resp.status_code == 409
    assert "sync is in progress" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_unsync_group_never_synced(mock_tg, real_db_app, mock_bg_tasks, mock_sync_status, client):
    """POST /groups/{id}/unsync on a never-synced group is a no-op success."""
    resp = await client.post("/groups/999/unsync")
    assert resp.status_code == 200
    assert resp.json()["success"] is True
```

Run: `cd backend && uv run pytest tests/test_routes_groups.py -k unsync -v`
Expected: All 3 unsync tests PASS

- [ ] **Step 4: Run full test suite to check for regressions**

Run: `cd backend && uv run pytest tests/test_routes_groups.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routes/groups.py backend/tests/test_routes_groups.py
git commit -m "feat: add POST /groups/{chat_id}/unsync endpoint"
```

---

### Task 3: Frontend — API client + hook

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/hooks/useGroups.ts`

- [ ] **Step 1: Add `unsyncGroup` to API client**

Add after the `clearGroupMedia` function (around line 97) in `frontend/src/api/client.ts`:

```typescript
export const unsyncGroup = (chatId: number) =>
  fetchJSON(`/groups/${chatId}/unsync`, SuccessResponse, {
    method: 'POST',
  })
```

- [ ] **Step 2: Add `unsyncGroup` handler to `useGroups` hook**

Modify `frontend/src/hooks/useGroups.ts`:

Update the import to include `unsyncGroup`:

```typescript
import {
  getGroups,
  getPreviewCounts,
  toggleGroupActive,
  unsyncGroup as unsyncGroupApi,
} from '#/api/client'
```

Add a new callback after `toggleActive` (around line 36):

```typescript
const unsyncGroup = useCallback(
  async (groupId: number) => {
    await unsyncGroupApi(groupId)
    queryClient.invalidateQueries({ queryKey: ['groups'] })
    queryClient.invalidateQueries({ queryKey: ['media'] })
    queryClient.invalidateQueries({ queryKey: ['counts'] })
    queryClient.invalidateQueries({ queryKey: ['preview-counts'] })
    queryClient.invalidateQueries({ queryKey: ['faces'] })
  },
  [queryClient],
)
```

Add `unsyncGroup` to the return object:

```typescript
return {
  groups,
  loading,
  error: error ? String(error) : null,
  toggleActive,
  unsyncGroup,
  activeGroupIds,
  displayFilteredGroupIds,
  refetch,
  previewCounts,
}
```

- [ ] **Step 3: Run frontend checks**

Run: `cd frontend && bun run check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/hooks/useGroups.ts
git commit -m "feat: add unsyncGroup API client and hook handler"
```

---

### Task 4: Frontend — GroupOverflowMenu component

**Files:**
- Create: `frontend/src/components/GroupOverflowMenu.tsx`

- [ ] **Step 1: Create the overflow menu component**

Create `frontend/src/components/GroupOverflowMenu.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Group, SyncStatus } from '#/api/schemas'

interface Props {
  group: Group
  syncStatus?: SyncStatus
  onHide: (group: Group) => void
  onUnsync: (group: Group) => void
}

export default function GroupOverflowMenu({
  group,
  syncStatus,
  onHide,
  onUnsync,
}: Props) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleHide = useCallback(() => {
    setOpen(false)
    onHide(group)
  }, [group, onHide])

  const handleUnsync = useCallback(() => {
    setOpen(false)
    const confirmed = window.confirm(
      `Unsync "${group.name}"? This will delete all downloaded media for this group.`,
    )
    if (confirmed) onUnsync(group)
  }, [group, onUnsync])

  const isSyncing = syncStatus?.status === 'syncing'
  const isSynced = group.last_synced !== null

  return (
    <div ref={menuRef} className="relative">
      <button
        className="shrink-0 rounded p-1 text-neutral-500 opacity-0 hover:bg-neutral-700 hover:text-neutral-300 group-hover:opacity-100"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((p) => !p)
        }}
        title="More actions"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-neutral-700 bg-neutral-800 py-1 shadow-lg">
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-amber-400 hover:bg-neutral-700"
            onClick={handleHide}
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
              <circle cx="8" cy="8" r="2" />
              <line x1="2" y1="14" x2="14" y2="2" />
            </svg>
            Hide from sidebar
          </button>
          {isSynced && (
            <>
              <div className="mx-2 my-1 border-t border-neutral-700" />
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 hover:bg-neutral-700 disabled:opacity-50"
                onClick={handleUnsync}
                disabled={isSyncing}
                title={
                  isSyncing ? 'Cannot unsync while sync is in progress' : ''
                }
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
                Unsync & delete media
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run frontend checks**

Run: `cd frontend && bun run check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/GroupOverflowMenu.tsx
git commit -m "feat: add GroupOverflowMenu component with hide and unsync actions"
```

---

### Task 5: Frontend — Wire overflow menu into Sidebar

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/routes/index.tsx`

- [ ] **Step 1: Update Sidebar props and replace hide button with overflow menu**

In `frontend/src/components/Sidebar.tsx`:

Add the import at the top:

```typescript
import GroupOverflowMenu from './GroupOverflowMenu'
```

Add `onUnsyncGroup` to the `Props` interface (after `onUnhideDialog` around line 45):

```typescript
onUnsyncGroup?: (group: Group) => void
```

Add `onUnsyncGroup` to the destructured props (after `onUnhideDialog` around line 119):

```typescript
onUnsyncGroup,
```

Replace the existing hide button block in the normal groups list (lines 374-395 — the `{onHideDialog && (` block) with:

```tsx
{onHideDialog && onUnsyncGroup && (
  <GroupOverflowMenu
    group={g}
    syncStatus={syncStatuses[g.id]}
    onHide={onHideDialog}
    onUnsync={onUnsyncGroup}
  />
)}
```

- [ ] **Step 2: Wire `onUnsyncGroup` in routes/index.tsx**

In `frontend/src/routes/index.tsx`:

Add `unsyncGroup` to the destructured return from `useGroups` (find the existing `useGroups` destructuring):

```typescript
const {
  groups,
  toggleActive,
  unsyncGroup,
  activeGroupIds,
  displayFilteredGroupIds,
  refetch: refetchGroups,
  previewCounts,
} = useGroups({ displayGroupIds })
```

Add the handler function after `handleUnhideDialog` (around line 510):

```typescript
const handleUnsyncGroup = async (group: Group) => {
  try {
    await unsyncGroup(group.id)
  } catch {
    toast.error('Failed to unsync group')
    return
  }
  toast.success(`${group.name} unsynced`)
  // Remove from display filter if present
  if (displayGroupIds.has(group.id)) {
    const remaining = [...displayGroupIds].filter((id) => id !== group.id)
    setSearch(
      { groups: remaining.length ? remaining.join(',') : undefined },
      { replace: true },
    )
  }
}
```

Add the prop to the `<Sidebar>` JSX (after `onUnhideDialog` around line 594):

```tsx
onUnsyncGroup={handleUnsyncGroup}
```

- [ ] **Step 3: Run frontend checks**

Run: `cd frontend && bun run check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/routes/index.tsx
git commit -m "feat: wire unsync overflow menu into Sidebar and route"
```

---

### Task 6: Verification

- [ ] **Step 1: Run backend tests**

Run: `cd backend && uv run pytest tests/test_routes_groups.py -v`
Expected: All tests PASS

- [ ] **Step 2: Run frontend checks**

Run: `cd frontend && bun run check`
Expected: No errors

- [ ] **Step 3: Manual test**

1. Start backend: `cd backend && uv run fastapi dev`
2. Start frontend: `cd frontend && bun run dev`
3. Sync a group, verify media appears
4. Click ⋯ on the synced group → "Unsync & delete media"
5. Confirm the dialog
6. Verify: media is deleted, group shows as inactive (no green dot, unchecked)
7. Verify: re-syncing the group works normally
8. Verify: ⋯ menu on an unsynced group only shows "Hide from sidebar"
9. Verify: ⋯ menu is disabled during active sync
