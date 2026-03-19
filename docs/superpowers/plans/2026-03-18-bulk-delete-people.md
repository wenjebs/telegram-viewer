# Bulk Delete People Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select bulk delete for people in the people grid, alongside the existing merge action.

**Architecture:** New `DELETE /faces/persons/delete-batch` backend endpoint reusing `delete_person()`. Rename `PersonMergeBar` → `PersonActionBar` with both Delete and Merge buttons. Wire into existing `personMerge.selectMode` state.

**Tech Stack:** FastAPI + aiosqlite (backend), React 19 + TanStack (frontend), Vitest + pytest (tests)

---

### Task 1: Backend — batch delete endpoint

**Files:**
- Modify: `backend/routes/faces.py:46-66` (add Pydantic model)
- Modify: `backend/routes/faces.py:231-234` (add endpoint before parameterized routes region)
- Test: `backend/tests/test_routes_faces.py`

- [ ] **Step 1: Write failing backend tests**

Add to `backend/tests/test_routes_faces.py` after `TestDeletePersonEndpoint`:

```python
class TestDeletePersonsBatch:
    async def test_delete_batch_success(self, client, real_db_app):
        db = real_db_app
        await _seed_media(db, msg_id=1, chat_id=1)
        await _seed_media(db, msg_id=2, chat_id=1)
        p1 = await _seed_person(db, name="Alice", face_count=1, media_id=1)
        p2 = await _seed_person(db, name="Bob", face_count=1, media_id=2)

        resp = await client.request(
            "DELETE",
            "/faces/persons/delete-batch",
            json={"person_ids": [p1, p2]},
        )

        assert resp.status_code == 200
        assert resp.json() == {"deleted": 2}
        # Both persons should be gone
        assert (await client.get(f"/faces/persons/{p1}")).status_code == 404
        assert (await client.get(f"/faces/persons/{p2}")).status_code == 404

    async def test_delete_batch_skips_missing(self, client, real_db_app):
        db = real_db_app
        await _seed_media(db, msg_id=1, chat_id=1)
        p1 = await _seed_person(db, name="Alice", face_count=1, media_id=1)

        resp = await client.request(
            "DELETE",
            "/faces/persons/delete-batch",
            json={"person_ids": [p1, 99999]},
        )

        assert resp.status_code == 200
        assert resp.json() == {"deleted": 1}

    async def test_delete_batch_empty(self, client, real_db_app):
        resp = await client.request(
            "DELETE",
            "/faces/persons/delete-batch",
            json={"person_ids": []},
        )

        assert resp.status_code == 200
        assert resp.json() == {"deleted": 0}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_routes_faces.py::TestDeletePersonsBatch -v`
Expected: FAIL (404 — endpoint doesn't exist)

- [ ] **Step 3: Add Pydantic model and endpoint**

In `backend/routes/faces.py`, add request model after `ConflictsRequest` (around line 64):

```python
class DeleteBatchRequest(BaseModel):
    person_ids: list[int]
```

Add endpoint before the `# region Routes — parameterized` comment (after `check_conflicts`, around line 232):

```python
@router.delete("/persons/delete-batch")
async def delete_persons_batch_endpoint(
    req: DeleteBatchRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    all_crop_paths: list[str] = []
    deleted = 0
    for person_id in req.person_ids:
        person = await get_person(db, person_id)
        if not person:
            continue
        crop_paths = await delete_person(db, person_id)
        all_crop_paths.extend(crop_paths)
        deleted += 1
    for path in all_crop_paths:
        try:
            Path(path).unlink(missing_ok=True)
        except OSError:
            logger.warning("Failed to delete crop file: %s", path)
    return {"deleted": deleted}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_routes_faces.py::TestDeletePersonsBatch -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/routes/faces.py backend/tests/test_routes_faces.py
git commit -m "feat(api): add DELETE /faces/persons/delete-batch endpoint"
```

---

### Task 2: Frontend — API client function

**Files:**
- Modify: `frontend/src/api/client.ts:431-434` (add after `deletePerson`)
- Test: `frontend/src/api/__tests__/client.test.ts`

- [ ] **Step 1: Write failing client test**

Add test in `frontend/src/api/__tests__/client.test.ts` near the existing `deletePerson` tests:

```typescript
it('deletePersonsBatch sends DELETE with person_ids', async () => {
  const fn = mockFetch({ '/faces/persons/delete-batch': { deleted: 2 } })
  const result = await deletePersonsBatch([1, 2])
  expect(result).toEqual({ deleted: 2 })
  expect(fn).toHaveBeenCalledWith(
    '/api/faces/persons/delete-batch',
    expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ person_ids: [1, 2] }),
    }),
  )
})
```

Add `deletePersonsBatch` to the import from `#/api/client`. Ensure `mockFetch` is imported from `#/test/fetch-mock`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run vitest run src/api/__tests__/client.test.ts -t "deletePersonsBatch"`
Expected: FAIL (function doesn't exist)

- [ ] **Step 3: Add client function**

In `frontend/src/api/client.ts`, add after `deletePerson` (line 434):

```typescript
export const deletePersonsBatch = (personIds: number[]) =>
  fetchJSON('/faces/persons/delete-batch', DeleteResponse, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person_ids: personIds }),
  })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && bun run vitest run src/api/__tests__/client.test.ts -t "deletePersonsBatch"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/__tests__/client.test.ts
git commit -m "feat(api): add deletePersonsBatch client function"
```

---

### Task 3: Rename PersonMergeBar → PersonActionBar with Delete button

**Files:**
- Rename: `frontend/src/components/PersonMergeBar.tsx` → `frontend/src/components/PersonActionBar.tsx`
- Modify: `frontend/src/routes/index.tsx` (update import + add onDelete prop)

- [ ] **Step 1: Rename file and update component**

Rename `PersonMergeBar.tsx` to `PersonActionBar.tsx`. Replace contents with:

```tsx
import { useState } from 'react'

interface Props {
  selectedCount: number
  merging: boolean
  deleting: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  onMerge: () => void
  onDelete: () => void
  onExitSelectMode: () => void
}

export default function PersonActionBar({
  selectedCount,
  merging,
  deleting,
  onSelectAll,
  onDeselectAll,
  onMerge,
  onDelete,
  onExitSelectMode,
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 border-t border-border bg-surface px-4 py-2">
        <span className="text-sm text-text">{selectedCount} selected</span>
        <div className="flex items-center gap-2">
          <button
            className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
            onClick={onSelectAll}
          >
            Select All
          </button>
          <button
            className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
            onClick={onDeselectAll}
          >
            Deselect
          </button>
          <button
            className="rounded bg-danger px-3 py-1 text-xs text-white hover:bg-danger/80 disabled:opacity-40"
            disabled={selectedCount < 1 || deleting}
            onClick={() => setShowConfirm(true)}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <button
            className="rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-40"
            disabled={selectedCount < 2 || merging}
            onClick={onMerge}
          >
            {merging ? 'Merging...' : 'Merge'}
          </button>
          <button
            className="rounded p-1 text-text-soft hover:bg-hover hover:text-text"
            onClick={onExitSelectMode}
            aria-label="Exit select mode"
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
      </div>
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 max-w-sm rounded-xl bg-surface p-6">
            <p className="text-sm text-text">
              Delete {selectedCount}{' '}
              {selectedCount === 1 ? 'person' : 'people'}? This removes
              all face data for{' '}
              {selectedCount === 1 ? 'this person' : 'these people'}.
              Photos will remain in your gallery.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg px-4 py-1.5 text-sm text-text-soft hover:bg-hover"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-danger px-4 py-1.5 text-sm font-semibold text-white hover:bg-danger/80"
                onClick={() => {
                  setShowConfirm(false)
                  onDelete()
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Update import in index.tsx**

In `frontend/src/routes/index.tsx`, change:
- Import: `PersonMergeBar` → `PersonActionBar` from `'#/components/PersonActionBar'`
- Also add `deletePersonsBatch` to the import from `'#/api/client'`

- [ ] **Step 3: Wire up the component in index.tsx**

Replace the `<PersonMergeBar .../>` JSX block (around line 607-617). Add `deleting` state and `onDelete` handler. Find the `PersonMergeBar` usage and replace with:

```tsx
<PersonActionBar
  selectedCount={data.personMerge.selectMode.selectedCount}
  merging={data.personMerge.merging}
  deleting={deletingPersons}
  onSelectAll={() =>
    data.personMerge.selectMode.selectAll(data.persons.persons)
  }
  onDeselectAll={data.personMerge.selectMode.deselectAll}
  onMerge={data.personMerge.openKeeperPicker}
  onDelete={handleDeletePersons}
  onExitSelectMode={data.personMerge.selectMode.exitSelectMode}
/>
```

Add state and handler in the component body (near other state declarations):

```typescript
const [deletingPersons, setDeletingPersons] = useState(false)

const handleDeletePersons = async () => {
  const ids = [...data.personMerge.selectMode.selectedIds]
  const count = ids.length
  setDeletingPersons(true)
  try {
    await deletePersonsBatch(ids)
    data.personMerge.selectMode.exitSelectMode()
    data.persons.invalidate()
    toast.success(`Deleted ${count} ${count === 1 ? 'person' : 'people'}`)
  } catch {
    toast.error('Failed to delete people')
  } finally {
    setDeletingPersons(false)
  }
}
```

- [ ] **Step 4: Run frontend lint/type check**

Run: `cd frontend && bun run check`
Expected: PASS (no lint or format errors)

- [ ] **Step 5: Manually verify in browser**

1. Navigate to `/?mode=people`
2. Cmd+click two people → PersonActionBar appears with Delete + Merge buttons
3. Click Delete → confirmation dialog appears
4. Confirm → people are deleted, toast shows, select mode exits

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PersonActionBar.tsx frontend/src/routes/index.tsx
git rm frontend/src/components/PersonMergeBar.tsx
git commit -m "feat(people): rename PersonMergeBar → PersonActionBar with bulk delete"
```

---

### Task 4: Update PersonMergeBar tests → PersonActionBar tests

**Files:**
- Modify: `frontend/src/components/__tests__/extracted-components.test.tsx:9` (update import)
- Modify: `frontend/src/components/__tests__/extracted-components.test.tsx:164-196` (rename describe, update props, add delete tests)

- [ ] **Step 1: Update import and describe block**

In `frontend/src/components/__tests__/extracted-components.test.tsx`:

Change import (line 9):
```typescript
import PersonActionBar from '#/components/PersonActionBar'
```

Replace the entire `describe('PersonMergeBar', ...)` block (lines 164-196) with:

```tsx
describe('PersonActionBar', () => {
  const defaultProps = {
    selectedCount: 3,
    merging: false,
    deleting: false,
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onMerge: vi.fn(),
    onDelete: vi.fn(),
    onExitSelectMode: vi.fn(),
  }

  it('shows selected count', () => {
    render(<PersonActionBar {...defaultProps} />)
    expect(screen.getByText('3 selected')).toBeTruthy()
  })

  it('merge button disabled when less than 2 selected', () => {
    render(<PersonActionBar {...defaultProps} selectedCount={1} />)
    const btn = screen.getByText('Merge')
    expect(btn).toBeDisabled()
  })

  it('merge button enabled when 2+ selected', () => {
    render(<PersonActionBar {...defaultProps} />)
    const btn = screen.getByText('Merge')
    expect(btn).not.toBeDisabled()
  })

  it('shows Merging... when merging', () => {
    render(<PersonActionBar {...defaultProps} merging={true} />)
    expect(screen.getByText('Merging...')).toBeTruthy()
  })

  it('delete button always enabled when selected', () => {
    render(<PersonActionBar {...defaultProps} selectedCount={1} />)
    const btn = screen.getByText('Delete')
    expect(btn).not.toBeDisabled()
  })

  it('shows Deleting... when deleting', () => {
    render(<PersonActionBar {...defaultProps} deleting={true} />)
    expect(screen.getByText('Deleting...')).toBeTruthy()
  })

  it('delete button opens confirmation dialog', () => {
    render(<PersonActionBar {...defaultProps} />)
    fireEvent.click(screen.getByText('Delete'))
    expect(
      screen.getByText(/Delete 3 people\?/),
    ).toBeTruthy()
  })

  it('confirmation cancel closes dialog without calling onDelete', () => {
    render(<PersonActionBar {...defaultProps} />)
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(defaultProps.onDelete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Search for any other remaining PersonMergeBar references**

Run: `grep -r "PersonMergeBar" frontend/src/`

Fix any other files still importing or referencing `PersonMergeBar`.

- [ ] **Step 3: Run full test suite**

Run: `cd frontend && bun run vitest run`
Run: `cd backend && uv run pytest tests/test_routes_faces.py -v`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "test: update PersonMergeBar tests → PersonActionBar with delete tests"
```
