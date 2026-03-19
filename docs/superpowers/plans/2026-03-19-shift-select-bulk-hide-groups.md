# Shift-Click Group Selection & Bulk Hide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shift-click range selection for groups in the Sidebar, with bulk hide via hotkey and context menu.

**Architecture:** Reuse the existing `useSelectMode` hook (add a `setAnchor` method) for group range selection in Sidebar. Add `POST /groups/hide-batch` backend endpoint mirroring existing `unhide-batch`. Wire bulk hide action via `h` hotkey (guarded by group selection state) and right-click context menu with confirmation dialog.

**Tech Stack:** FastAPI + aiosqlite (backend), React 19 + TanStack Query + Tailwind CSS v4 + react-hotkeys-hook (frontend)

**Spec:** `docs/superpowers/specs/2026-03-19-shift-select-bulk-hide-groups-design.md`

**Important — `h` hotkey conflict:** The `h` key is already used to toggle hidden media view (`useHomeShortcuts.ts:82`). Both `useHotkeys('h', ...)` handlers will fire simultaneously since react-hotkeys-hook has no priority system. To resolve this, pass `groupSelectHasSelection` into `useHomeShortcuts` and add a guard to the existing global `h` handler: `if (groupSelectHasSelection) return`. This ensures pressing `h` with groups selected only triggers the bulk hide, not the hidden view toggle.

---

### Task 1: Backend — `hide_dialogs` DB function

**Files:**
- Modify: `backend/database.py:643-659` (add after `hide_dialog`)
- Test: `backend/tests/test_routes_groups.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_routes_groups.py`, add after the `test_unhide_batch` test (~line 301):

```python
@pytest.mark.asyncio
async def test_hide_batch(mock_tg, real_db_app, mock_bg_tasks, client):
    db = real_db_app
    await upsert_dialogs_batch(db, [
        {"id": 1, "name": "G1", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
        {"id": 2, "name": "G2", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
        {"id": 3, "name": "G3", "type": "group", "unread_count": 0, "last_message_date": "2026-03-15T10:00:00"},
    ])

    resp = await client.post("/groups/hide-batch", json={"dialog_ids": [1, 3]})
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # Verify they are hidden
    resp2 = await client.get("/groups/hidden/count")
    assert resp2.json()["count"] == 2

    # Verify G2 is NOT hidden
    resp3 = await client.get("/groups/hidden")
    hidden_ids = [g["id"] for g in resp3.json()]
    assert 1 in hidden_ids
    assert 3 in hidden_ids
    assert 2 not in hidden_ids
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_routes_groups.py::test_hide_batch -v`
Expected: FAIL — 404 (endpoint doesn't exist yet)

- [ ] **Step 3: Add `hide_dialogs` DB function**

In `backend/database.py`, add after `hide_dialog` (after line 648):

```python
async def hide_dialogs(db: aiosqlite.Connection, dialog_ids: list[int]) -> None:
    if not dialog_ids:
        return
    placeholders = ", ".join("?" for _ in dialog_ids)
    await db.execute(
        f"UPDATE dialogs SET hidden_at = ? WHERE id IN ({placeholders})",
        (utc_now_iso(), *dialog_ids),
    )
    await db.commit()
```

- [ ] **Step 4: Add `POST /groups/hide-batch` endpoint**

In `backend/routes/groups.py`, add a `HideBatchRequest` model next to the existing `UnhideBatchRequest` (line 74):

```python
class HideBatchRequest(BaseModel):
    dialog_ids: list[int]
```

Add the endpoint after the existing `unhide-batch` route (after line 131):

```python
@router.post("/hide-batch")
async def hide_groups_batch(
    req: HideBatchRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    await hide_dialogs(db, req.dialog_ids)
    return {"success": True}
```

Import `hide_dialogs` in the route file's imports from `database`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_routes_groups.py::test_hide_batch -v`
Expected: PASS

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && uv run pytest tests/test_routes_groups.py -v`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/database.py backend/routes/groups.py backend/tests/test_routes_groups.py
git commit -m "feat: add POST /groups/hide-batch endpoint and hide_dialogs DB function"
```

---

### Task 2: Frontend API client — `hideDialogBatch`

**Files:**
- Modify: `frontend/src/api/client.ts:122-137` (add after existing hide functions)

- [ ] **Step 1: Add `hideDialogBatch` function**

In `frontend/src/api/client.ts`, add after `unhideDialogBatch` (~line 137):

```typescript
export const hideDialogBatch = (dialogIds: number[]) =>
  fetchJSON('/groups/hide-batch', SuccessResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dialog_ids: dialogIds }),
  })
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: add hideDialogBatch API client function"
```

---

### Task 3: Add `setAnchor` to `useSelectMode` hook

**Files:**
- Modify: `frontend/src/hooks/useSelectMode.ts`
- Test: `frontend/src/hooks/__tests__/useSelectMode.test.ts` (create if doesn't exist)

- [ ] **Step 1: Write the failing test**

Check if `frontend/src/hooks/__tests__/useSelectMode.test.ts` exists. If not, create it. Add:

```typescript
import { renderHook, act } from '@testing-library/react'
import { useSelectMode } from '../useSelectMode'

describe('useSelectMode', () => {
  it('setAnchor sets the anchor without modifying selectedIds', () => {
    const { result } = renderHook(() => useSelectMode())

    act(() => result.current.setAnchor(5))

    // selectedIds should still be empty
    expect(result.current.selectedIds.size).toBe(0)

    // Now shift-click (toggleRange) should use 5 as anchor
    const items = [
      { id: 3 },
      { id: 5 },
      { id: 7 },
      { id: 9 },
    ]
    act(() => result.current.toggleRange(9, items))

    // Should select range from 5 to 9: ids 5, 7, 9
    expect(result.current.selectedIds).toEqual(new Set([5, 7, 9]))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run vitest run src/hooks/__tests__/useSelectMode.test.ts`
Expected: FAIL — `setAnchor` is not a function

- [ ] **Step 3: Add `setAnchor` to the hook**

In `frontend/src/hooks/useSelectMode.ts`, add after the `deselectAll` callback (~line 92):

```typescript
const setAnchor = useCallback((id: number) => {
  lastClickedIdRef.current = id
}, [])
```

Add `setAnchor` to the return object:

```typescript
return {
  active,
  selectedIds,
  selectedCount: selectedIds.size,
  enterSelectMode,
  exitSelectMode,
  setSelection,
  toggle,
  toggleRange,
  selectAll,
  selectDateGroup,
  deselectAll,
  isSelected,
  setAnchor,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && bun run vitest run src/hooks/__tests__/useSelectMode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useSelectMode.ts frontend/src/hooks/__tests__/useSelectMode.test.ts
git commit -m "feat: add setAnchor method to useSelectMode hook"
```

---

### Task 4: Wire `useSelectMode` into Sidebar for group selection

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Add `useSelectMode` to Sidebar**

In `Sidebar.tsx`, import `useSelectMode`:

```typescript
import { useSelectMode } from '#/hooks/useSelectMode'
```

Inside the `Sidebar` component function, instantiate the hook:

```typescript
const groupSelect = useSelectMode()
```

- [ ] **Step 2: Update group click handler**

Replace the `onClick={() => toggleActive(g)}` on the group item (~line 520) with:

```typescript
onClick={(e) => {
  if (e.shiftKey) {
    groupSelect.toggleRange(g.id, filteredGroups)
  } else {
    if (groupSelect.selectedIds.size > 0) {
      groupSelect.deselectAll()
    }
    groupSelect.setAnchor(g.id)
    toggleActive(g)
  }
}}
```

Also update the `onKeyDown` handler to match:

```typescript
onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (e.shiftKey) {
      groupSelect.toggleRange(g.id, filteredGroups)
    } else {
      if (groupSelect.selectedIds.size > 0) {
        groupSelect.deselectAll()
      }
      groupSelect.setAnchor(g.id)
      toggleActive(g)
    }
  }
}}
```

- [ ] **Step 3: Add selection visual highlight**

Update the group item's `className` to layer a selection ring on top of the existing active/inactive styling. Replace the existing className (~line 519):

```typescript
className={`group mb-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
  g.active
    ? 'bg-hover/50 hover:bg-hover'
    : 'opacity-50 hover:bg-hover hover:opacity-75'
} ${groupSelect.selectedIds.has(g.id) ? 'ring-2 ring-accent' : ''}`}
```

- [ ] **Step 4: Add Escape to clear group selection**

In the Sidebar component, add a hotkey for Escape. Use the existing `useHotkeys` import:

```typescript
useHotkeys('escape', () => {
  if (groupSelect.selectedIds.size > 0) {
    groupSelect.deselectAll()
  }
}, [groupSelect.selectedIds.size, groupSelect.deselectAll])
```

- [ ] **Step 5: Verify manually — shift-click selects a range, normal click clears selection and toggles active**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: wire shift-click range selection for groups in Sidebar"
```

---

### Task 5: Bulk hide handler + confirmation dialog

**Files:**
- Modify: `frontend/src/hooks/useHomeHandlers.ts`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Add `handleHideDialogBatch` to `useHomeHandlers`**

In `frontend/src/hooks/useHomeHandlers.ts`, import `hideDialogBatch`:

```typescript
import { hideDialogBatch } from '#/api/client'
```

Add the batch handler after `handleHideDialog`:

```typescript
const handleHideDialogBatch = useCallback(
  async (dialogIds: number[]) => {
    try {
      await hideDialogBatch(dialogIds)
    } catch {
      toast.error('Failed to hide groups')
      return
    }
    toast.success(`${dialogIds.length} group${dialogIds.length > 1 ? 's' : ''} hidden`)
    refetchGroups()
    queryClient.invalidateQueries({ queryKey: ['hiddenDialogs'] })
    queryClient.invalidateQueries({ queryKey: ['media'] })
    invalidateCounts()
  },
  [queryClient, refetchGroups, invalidateCounts],
)
```

Return it from the hook.

- [ ] **Step 2: Add confirmation dialog state to Sidebar**

In `Sidebar.tsx`, add state for the confirmation dialog:

```typescript
const [hideConfirm, setHideConfirm] = useState<number[] | null>(null)
```

- [ ] **Step 3: Add confirmation dialog JSX**

At the end of the Sidebar's JSX (before the closing fragment/div), add:

```tsx
{hideConfirm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="rounded-xl bg-surface p-6 shadow-xl">
      <p className="mb-4 text-sm">
        Hide {hideConfirm.length} group{hideConfirm.length > 1 ? 's' : ''}?
      </p>
      <div className="flex justify-end gap-2">
        <button
          className="rounded-lg px-3 py-1.5 text-sm text-text-soft hover:bg-hover"
          onClick={() => setHideConfirm(null)}
        >
          Cancel
        </button>
        <button
          className="rounded-lg bg-warning/20 px-3 py-1.5 text-sm text-warning hover:bg-warning/30"
          onClick={async () => {
            await onHideDialogBatch(hideConfirm)
            groupSelect.deselectAll()
            setHideConfirm(null)
          }}
        >
          Hide
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Add `onHideDialogBatch` to Sidebar Props and destructure it**

Update the `Props` interface in `Sidebar.tsx`:

```typescript
interface Props {
  // ... existing props
  onHideDialogBatch: (dialogIds: number[]) => Promise<void>
}
```

Also destructure `onHideDialogBatch` in the component function signature alongside the other props (e.g. next to `onHideDialog`).

Pass it from the parent (Home route's `index.tsx`) where `handleHideDialogBatch` is called.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useHomeHandlers.ts frontend/src/components/Sidebar.tsx
git commit -m "feat: add bulk hide handler and confirmation dialog"
```

---

### Task 6: `h` hotkey for bulk group hide

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/hooks/useHomeShortcuts.ts`

- [ ] **Step 1: Add `h` hotkey in Sidebar**

In `Sidebar.tsx`, add a hotkey that triggers the confirmation dialog when groups are selected:

```typescript
useHotkeys('h', () => {
  if (groupSelect.selectedIds.size > 0) {
    setHideConfirm(Array.from(groupSelect.selectedIds))
  }
}, [groupSelect.selectedIds])
```

- [ ] **Step 1b: Guard global `h` hotkey against group selection**

In `useHomeShortcuts.ts`, add `groupSelectHasSelection: boolean` to the `UseHomeShortcutsParams` interface. Then update the existing `h` handler (~line 82) to also check this:

```typescript
useHotkeys(
  'h',
  () => {
    if (lightboxItem || selectMode.active || groupSelectHasSelection) return
    handleViewModeChange(viewMode === 'hidden' ? 'normal' : 'hidden')
  },
  [lightboxItem, selectMode.active, viewMode, groupSelectHasSelection],
)
```

The parent (Home route) will pass `groupSelectHasSelection` from the Sidebar's group selection state. This requires lifting `groupSelect.selectedIds.size > 0` up — either via a callback prop from Sidebar or by moving `useSelectMode` for groups into the Home route and passing it down. The simpler approach: add a `groupSelectCount` state to Home that Sidebar updates via a callback prop `onGroupSelectChange: (count: number) => void`.

- [ ] **Step 2: Add Escape to close confirmation dialog**

Update the existing Escape hotkey in the Sidebar to also close the confirmation dialog:

```typescript
useHotkeys('escape', () => {
  if (hideConfirm) {
    setHideConfirm(null)
  } else if (groupSelect.selectedIds.size > 0) {
    groupSelect.deselectAll()
  }
}, [hideConfirm, groupSelect.selectedIds.size, groupSelect.deselectAll])
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: add h hotkey for bulk group hide with confirmation"
```

---

### Task 7: Right-click context menu for selected groups

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Add context menu state**

In `Sidebar.tsx`, add state:

```typescript
const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
```

- [ ] **Step 2: Add `onContextMenu` to group items**

On the group item div, add:

```typescript
onContextMenu={(e) => {
  if (groupSelect.selectedIds.size > 0 && groupSelect.selectedIds.has(g.id)) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }
}}
```

- [ ] **Step 3: Add context menu JSX**

Add after the confirmation dialog JSX:

```tsx
{contextMenu && (
  <>
    <div
      className="fixed inset-0 z-40"
      onClick={() => setContextMenu(null)}
      onContextMenu={(e) => {
        e.preventDefault()
        setContextMenu(null)
      }}
    />
    <div
      className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-surface py-1 shadow-xl"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-warning hover:bg-hover"
        onClick={() => {
          setHideConfirm(Array.from(groupSelect.selectedIds))
          setContextMenu(null)
        }}
      >
        Hide {groupSelect.selectedIds.size} group{groupSelect.selectedIds.size > 1 ? 's' : ''}
      </button>
    </div>
  </>
)}
```

- [ ] **Step 4: Close context menu on Escape**

Update the Escape hotkey to also close context menu:

```typescript
useHotkeys('escape', () => {
  if (contextMenu) {
    setContextMenu(null)
  } else if (hideConfirm) {
    setHideConfirm(null)
  } else if (groupSelect.selectedIds.size > 0) {
    groupSelect.deselectAll()
  }
}, [contextMenu, hideConfirm, groupSelect.selectedIds.size, groupSelect.deselectAll])
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: add right-click context menu for bulk group hide"
```

---

### Task 8: Wire everything together in Home route

**Files:**
- Modify: `frontend/src/routes/index.tsx` (or wherever Home renders Sidebar)

- [ ] **Step 1: Find where Sidebar is rendered in the Home route**

Read the route file to find the Sidebar usage and the existing `handleHideDialog` prop.

- [ ] **Step 2: Pass `onHideDialogBatch` prop**

Add the new prop to the Sidebar component:

```tsx
<Sidebar
  // ... existing props
  onHideDialogBatch={handleHideDialogBatch}
/>
```

- [ ] **Step 3: Add `h` shortcut to ShortcutsModal**

Find `ShortcutsModal.tsx` and add the new shortcut to the displayed list:

```
h (with groups selected) → Hide selected groups
```

- [ ] **Step 4: Run frontend type check**

Run: `cd frontend && bun run tsgo`
Expected: No type errors

- [ ] **Step 5: Run frontend lint/format check**

Run: `cd frontend && bun run check`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/index.tsx frontend/src/components/ShortcutsModal.tsx
git commit -m "feat: wire bulk hide into Home route and update shortcuts modal"
```

---

### Task 9: Frontend tests

**Files:**
- Modify: `frontend/src/components/__tests__/Sidebar.test.tsx`

- [ ] **Step 0: Add a third mock group to test fixtures**

The existing `mockGroups` array only has `Chat A` (id: 1) and `Chat B` (id: 2). Add a third group to enable range selection tests:

```typescript
// In the mockGroups array, add:
{ id: 3, name: 'Chat C', type: 'group', unread_count: 0, active: false, last_synced: null, hidden_at: null, media_count: 0 },
```

Also add `onHideDialogBatch: vi.fn()` to `defaultProps`.

- [ ] **Step 1: Test shift-click selects range**

```typescript
it('shift+click selects range of groups', () => {
  render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() })

  // Click first group to set anchor
  fireEvent.click(screen.getByText('Chat A'))

  // Shift-click third group
  fireEvent.click(screen.getByText('Chat C'), { shiftKey: true })

  // Verify range is selected (visual ring class)
  const chatA = screen.getByText('Chat A').closest('[role="button"]')
  const chatB = screen.getByText('Chat B').closest('[role="button"]')
  const chatC = screen.getByText('Chat C').closest('[role="button"]')
  expect(chatA?.className).toContain('ring-accent')
  expect(chatB?.className).toContain('ring-accent')
  expect(chatC?.className).toContain('ring-accent')
})
```

- [ ] **Step 2: Test normal click clears selection**

```typescript
it('normal click clears group selection', () => {
  render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() })

  fireEvent.click(screen.getByText('Chat A'))
  fireEvent.click(screen.getByText('Chat C'), { shiftKey: true })

  // Normal click clears selection
  fireEvent.click(screen.getByText('Chat B'))

  const chatA = screen.getByText('Chat A').closest('[role="button"]')
  expect(chatA?.className).not.toContain('ring-accent')
})
```

- [ ] **Step 3: Run tests**

Run: `cd frontend && bun run vitest run src/components/__tests__/Sidebar.test.tsx`
Expected: All tests pass

- [ ] **Step 4: Run full frontend test suite**

Run: `cd frontend && bun run vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/__tests__/Sidebar.test.tsx
git commit -m "test: add shift-click group selection and bulk hide tests"
```
