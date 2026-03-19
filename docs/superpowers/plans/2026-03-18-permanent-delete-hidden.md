# Permanent Delete from Hidden View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add permanent deletion capability to the hidden view — delete database rows, cached files, and face data for hidden media items.

**Architecture:** One new backend database function (`delete_media_items_permanently`), two new API endpoints (`DELETE /media/delete-batch` and `DELETE /media/hidden`), frontend API client functions, SelectionBar "Delete" button in hidden mode, ViewModeHeader "Delete All" button, and two inline confirmation dialogs.

**Tech Stack:** Python/FastAPI/aiosqlite (backend), React 19/TanStack Query/Tailwind CSS v4 (frontend), Vitest/React Testing Library (frontend tests), pytest/httpx (backend tests)

**Spec:** `docs/superpowers/specs/2026-03-18-permanent-delete-hidden-design.md`

---

### Task 1: Backend — `delete_media_items_permanently` database function

**Files:**
- Modify: `backend/database.py` (add function in the `# region Hidden` section, after `get_hidden_media_ids` around line 665)
- Test: `backend/tests/test_database.py`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_database.py`, add the import `delete_media_items_permanently` to the existing imports from `database` (line 3), then add at the end of the file:

```python
# ---------------------------------------------------------------------------
# Permanent delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_media_items_permanently_removes_rows(db):
    await insert_media_item(db, make_media_item(
        message_id=1, chat_id=1, thumbnail_path="/tmp/thumb1.jpg",
    ))
    await insert_media_item(db, make_media_item(
        message_id=2, chat_id=1, thumbnail_path="/tmp/thumb2.jpg",
    ))
    items = await get_media_page(db, limit=10)
    ids = [item["id"] for item in items]

    # Hide them first
    await hide_media_items(db, ids)

    deleted, paths = await delete_media_items_permanently(db, ids)

    assert deleted == 2
    assert "/tmp/thumb1.jpg" in paths
    assert "/tmp/thumb2.jpg" in paths
    # Rows are gone
    assert await get_media_by_id(db, ids[0]) is None
    assert await get_media_by_id(db, ids[1]) is None


@pytest.mark.asyncio
async def test_delete_media_items_permanently_cleans_faces(db):
    await insert_media_item(db, make_media_item(message_id=1, chat_id=1))
    item = (await get_media_page(db, limit=1))[0]
    face = _make_face(item["id"])
    face["crop_path"] = "/tmp/crop.jpg"
    await insert_faces_batch(db, [face])
    await bulk_assign_persons(db, [{"face_ids": [1], "representative_face_id": 1}])
    await db.commit()

    await hide_media_items(db, [item["id"]])
    deleted, paths = await delete_media_items_permanently(db, [item["id"]])

    assert deleted == 1
    assert "/tmp/crop.jpg" in paths
    # Face row gone
    cursor = await db.execute("SELECT COUNT(*) FROM faces WHERE media_id = ?", (item["id"],))
    assert (await cursor.fetchone())[0] == 0
    # Person auto-deleted (had only one face)
    assert len(await get_all_persons(db)) == 0


@pytest.mark.asyncio
async def test_delete_media_items_permanently_reassigns_representative_face(db):
    """When a person loses their representative face but has remaining faces, reassign it."""
    await insert_media_item(db, make_media_item(message_id=1, chat_id=1))
    await insert_media_item(db, make_media_item(message_id=2, chat_id=1, file_id=2))
    items = await get_media_page(db, limit=10)

    face1 = _make_face(items[0]["id"])
    face1["crop_path"] = "/tmp/crop1.jpg"
    face2 = _make_face(items[1]["id"])
    face2["crop_path"] = "/tmp/crop2.jpg"
    face_ids = await insert_faces_batch(db, [face1, face2])
    await bulk_assign_persons(
        db, [{"face_ids": face_ids, "representative_face_id": face_ids[0]}]
    )
    await db.commit()

    # Hide and delete only the first media item (which has the representative face)
    await hide_media_items(db, [items[0]["id"]])
    deleted, paths = await delete_media_items_permanently(db, [items[0]["id"]])

    assert deleted == 1
    # Person still exists with face_count=1
    persons = await get_all_persons(db)
    assert len(persons) == 1
    # Representative face has been reassigned to the surviving face
    assert persons[0]["representative_face_id"] == face_ids[1]


@pytest.mark.asyncio
async def test_delete_media_items_permanently_returns_download_paths(db):
    await insert_media_item(db, make_media_item(message_id=1, chat_id=1))
    item = (await get_media_page(db, limit=1))[0]
    await db.execute(
        "UPDATE media_items SET download_path = ? WHERE id = ?",
        ("/tmp/dl.mp4", item["id"]),
    )
    await db.commit()

    await hide_media_items(db, [item["id"]])
    deleted, paths = await delete_media_items_permanently(db, [item["id"]])

    assert deleted == 1
    assert "/tmp/dl.mp4" in paths


@pytest.mark.asyncio
async def test_delete_media_items_permanently_nonexistent_ids(db):
    deleted, paths = await delete_media_items_permanently(db, [99999])
    assert deleted == 0
    assert paths == []


@pytest.mark.asyncio
async def test_delete_media_items_permanently_empty_list(db):
    deleted, paths = await delete_media_items_permanently(db, [])
    assert deleted == 0
    assert paths == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_database.py::test_delete_media_items_permanently_removes_rows -v`
Expected: FAIL — `ImportError: cannot import name 'delete_media_items_permanently'`

- [ ] **Step 3: Write the implementation**

In `backend/database.py`, add this function in the `# region Hidden` section, just before `# endregion` (before line 668):

```python
async def delete_media_items_permanently(
    db: aiosqlite.Connection, media_ids: list[int]
) -> tuple[int, list[str]]:
    """Permanently delete media items and all associated data.

    Returns (deleted_count, file_paths_for_cleanup).
    """
    if not media_ids:
        return 0, []

    placeholders = ", ".join("?" for _ in media_ids)

    # 1. Collect file paths before deletion
    async with await db.execute(
        f"SELECT thumbnail_path, download_path FROM media_items "
        f"WHERE id IN ({placeholders}) "
        f"AND (thumbnail_path IS NOT NULL OR download_path IS NOT NULL)",
        media_ids,
    ) as cursor:
        rows = await cursor.fetchall()
    paths = [p for row in rows for p in (row[0], row[1]) if p]

    # 2. Collect crop paths from faces
    async with await db.execute(
        f"SELECT crop_path FROM faces "
        f"WHERE media_id IN ({placeholders}) AND crop_path IS NOT NULL",
        media_ids,
    ) as cursor:
        paths += [row[0] for row in await cursor.fetchall()]

    # 3. Collect affected person IDs
    async with await db.execute(
        f"SELECT DISTINCT person_id FROM faces "
        f"WHERE media_id IN ({placeholders}) AND person_id IS NOT NULL",
        media_ids,
    ) as cursor:
        affected_person_ids = [row[0] for row in await cursor.fetchall()]

    # 4. Delete faces
    await db.execute(
        f"DELETE FROM faces WHERE media_id IN ({placeholders})", media_ids
    )

    # 5. Update affected persons: recount faces, delete empty, reassign representative
    if affected_person_ids:
        p_placeholders = ", ".join("?" for _ in affected_person_ids)
        now = utc_now_iso()

        # Delete persons with no remaining faces
        await db.execute(
            f"DELETE FROM persons WHERE id IN ({p_placeholders}) "
            f"AND id NOT IN (SELECT DISTINCT person_id FROM faces WHERE person_id IS NOT NULL)",
            affected_person_ids,
        )

        # Recount face_count for surviving persons
        await db.execute(
            f"UPDATE persons SET face_count = ("
            f"  SELECT COUNT(*) FROM faces WHERE person_id = persons.id"
            f"), updated_at = ? WHERE id IN ({p_placeholders})",
            [now, *affected_person_ids],
        )

        # Reassign representative_face_id for surviving persons whose representative was deleted
        await db.execute(
            f"UPDATE persons SET representative_face_id = ("
            f"  SELECT MIN(id) FROM faces WHERE person_id = persons.id"
            f") WHERE id IN ({p_placeholders}) "
            f"AND representative_face_id NOT IN (SELECT id FROM faces)",
            affected_person_ids,
        )

    # 6. Delete media items
    async with await db.execute(
        f"DELETE FROM media_items WHERE id IN ({placeholders})", media_ids
    ) as cursor:
        deleted_count = cursor.rowcount

    await db.commit()
    return deleted_count, paths
```

- [ ] **Step 4: Run all delete tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_database.py -k "delete_media_items_permanently" -v`
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/database.py backend/tests/test_database.py
git commit -m "feat(media): add delete_media_items_permanently database function"
```

---

### Task 2: Backend — Route endpoints

**Files:**
- Modify: `backend/routes/media.py` (add 2 endpoints in the `# region Hidden` section, after `hide_media_batch` around line 425)
- Test: `backend/tests/test_routes_media.py`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_routes_media.py`, add `hide_media_items` to the import from `database` (line 6), then add at the end of the file:

```python
# ---------------------------------------------------------------------------
# Permanent delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_batch_success(seeded_db):
    # seeded_db creates exactly 3 items (see seeded_db fixture)
    async with _client() as client:
        items = (await client.get("/media?limit=3")).json()["items"]
    ids = [items[0]["id"], items[1]["id"]]
    await hide_media_items(seeded_db, ids)

    async with _client() as client:
        resp = await client.request("DELETE", "/media/delete-batch", json={"media_ids": ids})
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 2

    # Verify items are gone (1 of 3 remains)
    async with _client() as client:
        resp = await client.get("/media?limit=10")
    assert len(resp.json()["items"]) == 1


@pytest.mark.asyncio
async def test_delete_batch_filters_to_hidden_only(seeded_db):
    """Non-hidden items in the batch are silently ignored."""
    async with _client() as client:
        items = (await client.get("/media?limit=3")).json()["items"]
    # Hide only one
    await hide_media_items(seeded_db, [items[0]["id"]])

    async with _client() as client:
        resp = await client.request(
            "DELETE", "/media/delete-batch",
            json={"media_ids": [items[0]["id"], items[1]["id"]]},
        )
    assert resp.status_code == 200
    # Only the hidden one was deleted
    assert resp.json()["deleted"] == 1

    # The non-hidden item still exists (2 of 3 remain)
    async with _client() as client:
        resp = await client.get("/media?limit=10")
    assert len(resp.json()["items"]) == 2


@pytest.mark.asyncio
async def test_delete_batch_empty_validation_error(seeded_db):
    async with _client() as client:
        resp = await client.request("DELETE", "/media/delete-batch", json={"media_ids": []})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_delete_all_hidden(seeded_db):
    async with _client() as client:
        items = (await client.get("/media?limit=3")).json()["items"]
    await hide_media_items(seeded_db, [items[0]["id"], items[1]["id"]])

    async with _client() as client:
        resp = await client.request("DELETE", "/media/hidden")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 2

    # Hidden count is now 0
    async with _client() as client:
        resp = await client.get("/media/hidden/count")
    assert resp.json()["count"] == 0


@pytest.mark.asyncio
async def test_delete_all_hidden_when_none_hidden(seeded_db):
    async with _client() as client:
        resp = await client.request("DELETE", "/media/hidden")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_routes_media.py::test_delete_batch_success -v`
Expected: FAIL — 405 Method Not Allowed (endpoint doesn't exist)

- [ ] **Step 3: Write the implementation**

In `backend/routes/media.py`:

Add to the import from `database` (around line 21):
```python
from database import (
    # ... existing imports ...
    delete_media_items_permanently,
    get_hidden_media_ids,
)
```

Add these two endpoints in the `# region Hidden` section, after `hide_media_batch` (around line 425) and before `favorite_media_batch`:

```python
@router.delete("/delete-batch")
async def delete_media_batch_endpoint(
    body: BatchIdsRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    # Safety guard: only delete items that are actually hidden
    placeholders = ", ".join("?" for _ in body.media_ids)
    async with await db.execute(
        f"SELECT id FROM media_items WHERE id IN ({placeholders}) AND hidden_at IS NOT NULL",
        body.media_ids,
    ) as cursor:
        hidden_ids = [row[0] for row in await cursor.fetchall()]

    deleted, file_paths = await delete_media_items_permanently(db, hidden_ids)
    for path in file_paths:
        try:
            Path(path).unlink(missing_ok=True)
        except OSError:
            logger.warning("Failed to delete file: %s", path)
    return {"deleted": deleted}


@router.delete("/hidden")
async def delete_all_hidden_endpoint(
    db: aiosqlite.Connection = Depends(get_db),
):
    hidden_ids = await get_hidden_media_ids(db)
    deleted, file_paths = await delete_media_items_permanently(db, hidden_ids)
    for path in file_paths:
        try:
            Path(path).unlink(missing_ok=True)
        except OSError:
            logger.warning("Failed to delete file: %s", path)
    return {"deleted": deleted}
```

Verify that `Path` and `logger` are already imported at the top of the file. `Path` is imported from `pathlib` and `logger` is defined via `logging.getLogger(__name__)`.

**Important:** The `DELETE /hidden` endpoint must be placed **before** any `/{media_id}` parameterized routes to avoid FastAPI treating "hidden" as a media_id. Since it's already in the static routes region (same region as `GET /hidden`), placing it right after `hide_media_batch` is correct.

- [ ] **Step 4: Run all delete route tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_routes_media.py -k "delete" -v`
Expected: all 5 tests PASS

- [ ] **Step 5: Run full backend test suite**

Run: `cd backend && uv run pytest -v`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routes/media.py backend/tests/test_routes_media.py
git commit -m "feat(media): add delete-batch and delete-all-hidden endpoints"
```

---

### Task 3: Frontend — API client + schema

**Files:**
- Modify: `frontend/src/api/schemas.ts` (add `DeleteResponse` schema)
- Modify: `frontend/src/api/client.ts` (add 2 functions)

- [ ] **Step 1: Add schema**

In `frontend/src/api/schemas.ts`, after the `IdsResponse` line (line 6), add:

```typescript
export const DeleteResponse = z.object({ deleted: z.number() })
```

In the inferred types section at the bottom, add:

```typescript
export type DeleteResponse = z.infer<typeof DeleteResponse>
```

- [ ] **Step 2: Add API functions**

In `frontend/src/api/client.ts`, in the Hidden section (after `getHiddenCount` around line 242), add:

```typescript
export const deleteMediaBatch = (mediaIds: number[]) =>
  fetchJSON('/media/delete-batch', DeleteResponse, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })

export const deleteAllHidden = () =>
  fetchJSON('/media/hidden', DeleteResponse, { method: 'DELETE' })
```

Update the import from `'#/api/schemas'` to include `DeleteResponse`.

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && bunx --bun tsgo --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/schemas.ts frontend/src/api/client.ts
git commit -m "feat(api): add deleteMediaBatch and deleteAllHidden client functions"
```

---

### Task 4: Frontend — SelectionBar Delete button in hidden mode

**Files:**
- Modify: `frontend/src/components/SelectionBar.tsx`
- Modify: `frontend/src/components/__tests__/SelectionBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `frontend/src/components/__tests__/SelectionBar.test.tsx`, add inside the `describe('SelectionBar')` block:

```typescript
  it('shows Delete button in hidden mode', () => {
    render(
      <SelectionBar
        {...defaultProps}
        viewMode="hidden"
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('Delete')).toBeTruthy()
    expect(screen.getByText('Unhide')).toBeTruthy()
  })

  it('calls onDelete when Delete clicked in hidden mode', () => {
    const onDelete = vi.fn()
    render(
      <SelectionBar
        {...defaultProps}
        viewMode="hidden"
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalled()
  })

  it('does not show Delete button in normal mode', () => {
    render(<SelectionBar {...defaultProps} viewMode="normal" />)
    expect(screen.queryByText('Delete')).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/SelectionBar.test.tsx`
Expected: FAIL — `onDelete` not a prop, no Delete button rendered

- [ ] **Step 3: Write the implementation**

In `frontend/src/components/SelectionBar.tsx`:

Add to the `Props` interface (after `onBeforeHide` on line 23):
```typescript
  onDelete?: () => void
```

Add `onDelete` to the destructured props (after `onBeforeHide` on line 38):
```typescript
  onDelete,
```

Add a ref for the delete handler and a keyboard shortcut. After `viewModeRef` (line 133), add:
```typescript
  const onDeleteRef = useRef(onDelete)
  onDeleteRef.current = onDelete
```

In the `handleKeyDown` callback (line 135), add before the closing `}, []`:
```typescript
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (viewModeRef.current === 'hidden' && onDeleteRef.current) {
        e.preventDefault()
        onDeleteRef.current()
      }
    }
```

In the render, replace the hidden mode branch (lines 180-187):

```tsx
        {viewMode === 'hidden' ? (
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-success px-4 py-1.5 text-sm font-semibold text-white hover:bg-success/80 disabled:opacity-50"
              onClick={handleUnhide}
              disabled={selectedCount === 0 || unhiding}
            >
              {unhiding ? 'Unhiding...' : 'Unhide'}
            </button>
            {onDelete && (
              <button
                className="rounded-lg bg-danger px-4 py-1.5 text-sm font-semibold text-white hover:bg-danger/80 disabled:opacity-50"
                onClick={onDelete}
                disabled={selectedCount === 0}
              >
                Delete{' '}
                <span className="text-xs text-white/40">⌫</span>
              </button>
            )}
          </div>
        ) : (
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/SelectionBar.test.tsx`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SelectionBar.tsx frontend/src/components/__tests__/SelectionBar.test.tsx
git commit -m "feat(hidden): add Delete button to SelectionBar in hidden mode"
```

---

### Task 5: Frontend — ViewModeHeader "Delete All" button

**Files:**
- Modify: `frontend/src/components/ViewModeHeader.tsx`
- Create: `frontend/src/components/__tests__/ViewModeHeader.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/ViewModeHeader.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import ViewModeHeader from '#/components/ViewModeHeader'

describe('ViewModeHeader', () => {
  it('renders Delete All button in hidden mode', () => {
    render(
      <ViewModeHeader
        viewMode="hidden"
        onClose={vi.fn()}
        onDeleteAll={vi.fn()}
        hiddenCount={5}
      />,
    )
    expect(screen.getByText('Delete All')).toBeTruthy()
  })

  it('calls onDeleteAll when clicked', () => {
    const onDeleteAll = vi.fn()
    render(
      <ViewModeHeader
        viewMode="hidden"
        onClose={vi.fn()}
        onDeleteAll={onDeleteAll}
        hiddenCount={5}
      />,
    )
    fireEvent.click(screen.getByText('Delete All'))
    expect(onDeleteAll).toHaveBeenCalled()
  })

  it('disables Delete All when hiddenCount is 0', () => {
    render(
      <ViewModeHeader
        viewMode="hidden"
        onClose={vi.fn()}
        onDeleteAll={vi.fn()}
        hiddenCount={0}
      />,
    )
    expect(
      screen.getByText('Delete All').closest('button')?.disabled,
    ).toBe(true)
  })

  it('does not render Delete All in favorites mode', () => {
    render(
      <ViewModeHeader
        viewMode="favorites"
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByText('Delete All')).toBeNull()
  })

  it('returns null for normal mode', () => {
    const { container } = render(
      <ViewModeHeader viewMode="normal" onClose={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/ViewModeHeader.test.tsx`
Expected: FAIL — `onDeleteAll` not a prop, no Delete All button

- [ ] **Step 3: Write the implementation**

Replace `frontend/src/components/ViewModeHeader.tsx` entirely:

```typescript
import type { ViewMode } from '#/hooks/useHomeData'

interface Props {
  viewMode: ViewMode
  onClose: () => void
  onDeleteAll?: () => void
  hiddenCount?: number
}

export default function ViewModeHeader({
  viewMode,
  onClose,
  onDeleteAll,
  hiddenCount,
}: Props) {
  if (viewMode === 'normal' || viewMode === 'people') return null

  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
      {viewMode === 'hidden' && (
        <svg
          className="h-4 w-4 text-text-soft"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
          <circle cx="8" cy="8" r="2" />
          <line x1="2" y1="14" x2="14" y2="2" />
        </svg>
      )}
      {viewMode === 'favorites' && (
        <span className="text-sm text-text-soft">&#9829;</span>
      )}
      <span className="flex-1 text-sm font-medium text-text">
        {viewMode === 'hidden' && 'Hidden Media'}
        {viewMode === 'favorites' && 'Favorites'}
      </span>
      {viewMode === 'hidden' && onDeleteAll && (
        <button
          className="rounded px-2 py-1 text-xs text-danger hover:bg-hover disabled:opacity-50 disabled:hover:bg-transparent"
          onClick={onDeleteAll}
          disabled={hiddenCount === 0}
        >
          Delete All
        </button>
      )}
      <button
        className="rounded p-1 text-text-soft hover:bg-hover hover:text-text"
        onClick={onClose}
        aria-label="Back to gallery"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/ViewModeHeader.test.tsx`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ViewModeHeader.tsx frontend/src/components/__tests__/ViewModeHeader.test.tsx
git commit -m "feat(hidden): add Delete All button to ViewModeHeader"
```

---

### Task 6: Frontend — Wire delete actions + confirmation dialogs into route

**Files:**
- Modify: `frontend/src/routes/index.tsx`

- [ ] **Step 1: Add imports**

In `frontend/src/routes/index.tsx`, add `deleteMediaBatch` and `deleteAllHidden` to the import from `'#/api/client'`.

- [ ] **Step 2: Add state for confirmation dialogs**

Inside the `Home` component, add state (near the other `useState` calls):

```typescript
const [deleteConfirm, setDeleteConfirm] = useState<{
  type: 'selection' | 'all'
  ids?: number[]
} | null>(null)
```

- [ ] **Step 3: Add the delete handler**

Add a handler that performs the actual deletion after confirmation:

```typescript
const handleConfirmDelete = useCallback(async () => {
  if (!deleteConfirm) return
  try {
    if (deleteConfirm.type === 'selection' && deleteConfirm.ids) {
      const { deleted } = await deleteMediaBatch(deleteConfirm.ids)
      data.hidden.removeItems(deleteConfirm.ids)
      data.selectMode.exitSelectMode()
      toast.success(
        `Deleted ${deleted} ${deleted === 1 ? 'photo' : 'photos'} permanently`,
      )
    } else {
      const { deleted } = await deleteAllHidden()
      toast.success(`Deleted all ${deleted} hidden items`)
    }
    data.invalidateCounts()
    data.invalidateActiveMedia()
    data.persons.invalidate()
  } catch {
    toast.error('Failed to delete')
  } finally {
    setDeleteConfirm(null)
  }
}, [
  deleteConfirm,
  data.hidden,
  data.selectMode,
  data.invalidateCounts,
  data.invalidateActiveMedia,
  data.persons,
])
```

- [ ] **Step 4: Wire SelectionBar onDelete**

In the `SelectionBar` component usage (around line 491), add the `onDelete` prop:

```tsx
onDelete={
  data.viewMode === 'hidden'
    ? () =>
        setDeleteConfirm({
          type: 'selection',
          ids: [...data.selectMode.selectedIds],
        })
    : undefined
}
```

- [ ] **Step 5: Wire ViewModeHeader onDeleteAll**

Find the `ViewModeHeader` usage. It's rendered conditionally — look for where `viewMode === 'hidden'` or `viewMode === 'favorites'` headers are rendered. The `ViewModeHeader` component is used around the `ViewModeTabs` area. Update it to pass `onDeleteAll` and `hiddenCount`:

```tsx
<ViewModeHeader
  viewMode={data.viewMode}
  onClose={() => handlers.handleViewModeChange('normal')}
  onDeleteAll={() => setDeleteConfirm({ type: 'all' })}
  hiddenCount={data.hiddenCount}
/>
```

Note: Check where `ViewModeHeader` is currently rendered — it may not be in the exact same place as `ViewModeTabs`. Search for `<ViewModeHeader` in the file.

- [ ] **Step 6: Render confirmation dialog**

Add before the closing `</div>` of the main layout (before `{data.selectMode.active && (`):

```tsx
{deleteConfirm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="mx-4 max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
      <p className="text-sm text-text">
        {deleteConfirm.type === 'selection'
          ? `Permanently delete ${deleteConfirm.ids?.length ?? 0} ${(deleteConfirm.ids?.length ?? 0) === 1 ? 'photo' : 'photos'}? This cannot be undone.`
          : `Permanently delete all ${data.hiddenCount} hidden items? This cannot be undone.`}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          className="rounded-lg px-4 py-1.5 text-sm text-text-soft hover:bg-hover"
          onClick={() => setDeleteConfirm(null)}
        >
          Cancel
        </button>
        <button
          className="rounded-lg bg-danger px-4 py-1.5 text-sm font-semibold text-white hover:bg-danger/80"
          onClick={handleConfirmDelete}
        >
          {deleteConfirm.type === 'selection'
            ? 'Delete forever'
            : 'Delete all'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Verify types compile**

Run: `cd frontend && bunx --bun tsgo --noEmit`
Expected: no errors

- [ ] **Step 8: Run lint/format**

Run: `cd frontend && bun run check`
Expected: passes

- [ ] **Step 9: Commit**

```bash
git add frontend/src/routes/index.tsx
git commit -m "feat(hidden): wire delete actions and confirmation dialogs into route"
```

---

### Task 7: Verification pass

**Files:** None new — this is a verification pass.

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && uv run pytest -v`
Expected: all tests PASS

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && bun run vitest run`
Expected: all tests PASS

- [ ] **Step 3: Run frontend lint/format**

Run: `cd frontend && bun run check`
Expected: passes

- [ ] **Step 4: Verify types**

Run: `cd frontend && bunx --bun tsgo --noEmit`
Expected: no errors

- [ ] **Step 5: Commit any fixes**

If any fixes were needed:
```bash
git add -A && git commit -m "fix: address test/lint issues from permanent delete feature"
```
