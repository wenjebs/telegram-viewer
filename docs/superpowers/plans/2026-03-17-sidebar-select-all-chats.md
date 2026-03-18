# Sidebar Select-All Chats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bulk select/deselect buttons to the Sidebar chat list so the user can activate all currently visible (filtered) chats at once, or clear all active chats.

**Architecture:** Add `bulkSetActive(groups, active)` to `useGroups` (fires parallel API calls + optimistic cache update). In `Sidebar`, render a compact action row above the chat list showing "Select all" (activates all `filteredGroups`) and "Deselect all" (deactivates all currently active groups globally). All existing filter/search state is respected — selecting while `chat=dm` selects only DMs, searching then selecting only activates search results.

**Tech Stack:** React 19, TanStack Query, TypeScript, Tailwind CSS v4, Vitest + React Testing Library, bun

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/hooks/useGroups.ts` | Add `bulkSetActive` function, add to return object |
| `frontend/src/hooks/__tests__/useGroups.test.ts` | Add `bulkSetActive` tests following existing pattern |
| `frontend/src/components/Sidebar.tsx` | Destructure `bulkSetActive`, add action row above chat list |
| `frontend/src/components/__tests__/Sidebar.test.tsx` | Add `bulkSetActive: vi.fn()` to mock, add tests for new buttons |

---

### Task 1: Add `bulkSetActive` to `useGroups`

**Files:**
- Modify: `frontend/src/hooks/useGroups.ts`
- Test: `frontend/src/hooks/__tests__/useGroups.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `frontend/src/hooks/__tests__/useGroups.test.ts` (inside the existing `describe('useGroups', ...)` block, after the last `it(...)`):

```typescript
  it('bulkSetActive activates all inactive groups', async () => {
    const g1 = makeGroup({ active: false })
    const g2 = makeGroup({ active: false })
    const g3 = makeGroup({ active: true })

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url
      if (url.includes('/active')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/preview-counts')) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify([g1, g2, g3]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useGroups(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.groups.length).toBe(3))

    await act(async () => {
      await result.current.bulkSetActive([g1, g2], true)
    })

    // Should have called PATCH for g1 and g2 (not g3 which is already active)
    const patchCalls = (
      globalThis.fetch as ReturnType<typeof vi.fn>
    ).mock.calls.filter((args: unknown[]) =>
      (args[0] as string).includes('/active'),
    )
    expect(patchCalls.length).toBe(2)
    expect(result.current.groups.find((g) => g.id === g1.id)!.active).toBe(
      true,
    )
    expect(result.current.groups.find((g) => g.id === g2.id)!.active).toBe(
      true,
    )
  })

  it('bulkSetActive skips groups already matching target state', async () => {
    const g1 = makeGroup({ active: true })

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url
      if (url.includes('/preview-counts')) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify([g1]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useGroups(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.groups.length).toBe(1))

    await act(async () => {
      // g1 is already active — no PATCH should fire
      await result.current.bulkSetActive([g1], true)
    })

    const patchCalls = (
      globalThis.fetch as ReturnType<typeof vi.fn>
    ).mock.calls.filter((args: unknown[]) =>
      (args[0] as string).includes('/active'),
    )
    expect(patchCalls.length).toBe(0)
  })

  it('bulkSetActive deactivates groups', async () => {
    const g1 = makeGroup({ active: true })
    const g2 = makeGroup({ active: true })

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url
      if (url.includes('/active')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/preview-counts')) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify([g1, g2]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useGroups(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.groups.length).toBe(2))

    await act(async () => {
      await result.current.bulkSetActive([g1, g2], false)
    })

    expect(result.current.groups.every((g) => !g.active)).toBe(true)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && bun run test src/hooks/__tests__/useGroups.test.ts
```

Expected: 3 new tests FAIL — `result.current.bulkSetActive is not a function`

- [ ] **Step 3: Add `bulkSetActive` to `useGroups`**

In `frontend/src/hooks/useGroups.ts`, add the function after `toggleActive` (before `unsyncGroup`):

```typescript
  const bulkSetActive = useCallback(
    async (targetGroups: Group[], active: boolean) => {
      const toChange = targetGroups.filter((g) => g.active !== active)
      if (toChange.length === 0) return
      await Promise.all(
        toChange.map((g) => toggleGroupActive(g.id, active, g.name)),
      )
      const ids = new Set(toChange.map((g) => g.id))
      queryClient.setQueryData<Group[]>(['groups'], (prev) =>
        prev?.map((g) => (ids.has(g.id) ? { ...g, active } : g)),
      )
    },
    [queryClient],
  )
```

Also add `bulkSetActive` to the `return { ... }` object at the bottom of `useGroups`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && bun run test src/hooks/__tests__/useGroups.test.ts
```

Expected: all tests PASS (including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/hooks/useGroups.ts src/hooks/__tests__/useGroups.test.ts
git commit -m "feat: add bulkSetActive to useGroups"
```

---

### Task 2: Add select-all UI to Sidebar

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/__tests__/Sidebar.test.tsx`

**Key facts about the current Sidebar JSX structure:**
- Line ~179: `const { groups, toggleActive, previewCounts } = useGroups()` — needs `bulkSetActive` destructured
- `filteredGroups` (line ~335) is already computed from search + `chatTypeFilter` + `syncFilter`
- The collapsible section: a `grid` container wraps filter controls (always rendered, collapses via CSS), then a separate `{!chatsCollapsed && (...)}` conditional renders the scrollable chat list
- The action row goes inside that conditional, directly above `<div className="flex-1 overflow-y-auto p-2">`

- [ ] **Step 1: Write failing tests for the new buttons**

Add to `frontend/src/components/__tests__/Sidebar.test.tsx`:

First, add `bulkSetActive: vi.fn()` to the mock. There are two places in the file:

1. The `vi.mock('#/hooks/useGroups', ...)` block at line ~72:
```typescript
vi.mock('#/hooks/useGroups', () => ({
  useGroups: vi.fn(() => ({
    groups: mockGroups,
    toggleActive: mockToggleActive,
    bulkSetActive: vi.fn(),   // add this line
    previewCounts: {},
    activeGroupIds: [1],
    unsyncGroup: vi.fn(),
    refetch: vi.fn(),
  })),
}))
```

2. The `beforeEach` block that calls `(useGroups as Mock).mockReturnValue(...)` at line ~117:
```typescript
;(useGroups as Mock).mockReturnValue({
  groups: mockGroups,
  toggleActive: mockToggleActive,
  bulkSetActive: vi.fn(),   // add this line
  previewCounts: {},
  activeGroupIds: [1],
  unsyncGroup: vi.fn(),
  refetch: vi.fn(),
})
```

Then add these tests at the bottom of the `describe('Sidebar', ...)` block:

```typescript
  it('renders Select all and Deselect all buttons', () => {
    render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() })
    expect(screen.getByText('Select all')).toBeTruthy()
    expect(screen.getByText('Deselect all')).toBeTruthy()
  })

  it('Select all calls bulkSetActive with filteredGroups and true', () => {
    const mockBulkSetActive = vi.fn()
    ;(useGroups as Mock).mockReturnValue({
      groups: mockGroups,
      toggleActive: mockToggleActive,
      bulkSetActive: mockBulkSetActive,
      previewCounts: {},
      activeGroupIds: [1],
      unsyncGroup: vi.fn(),
      refetch: vi.fn(),
    })
    render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Select all'))
    expect(mockBulkSetActive).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 2 }),
      ]),
      true,
    )
  })

  it('Deselect all calls bulkSetActive with all active groups and false', () => {
    const mockBulkSetActive = vi.fn()
    ;(useGroups as Mock).mockReturnValue({
      groups: mockGroups,
      toggleActive: mockToggleActive,
      bulkSetActive: mockBulkSetActive,
      previewCounts: {},
      activeGroupIds: [1],
      unsyncGroup: vi.fn(),
      refetch: vi.fn(),
    })
    render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Deselect all'))
    // Only active groups should be passed (mockGroups[0] has active: true)
    expect(mockBulkSetActive).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 1, active: true })],
      false,
    )
  })

  it('shows correct active count in action row', () => {
    render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() })
    // 1 of 2 groups in filteredGroups is active
    expect(screen.getByText('1 / 2')).toBeTruthy()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && bun run test src/components/__tests__/Sidebar.test.tsx
```

Expected: 4 new tests FAIL (buttons not rendered yet), existing tests that check `useGroups` mock may also fail because `bulkSetActive` is missing — that will be resolved in Step 3.

- [ ] **Step 3: Update Sidebar.tsx**

**Change 1** — destructure `bulkSetActive` from `useGroups()` (line ~179):

```typescript
// Before:
const { groups, toggleActive, previewCounts } = useGroups()

// After:
const { groups, toggleActive, bulkSetActive, previewCounts } = useGroups()
```

**Change 2** — add the action row. Locate `{!chatsCollapsed && (` in the file at **lines ~447–533** and replace the entire block with the code below. Do **not** try to match the snippet by text search — the current source uses `filteredHiddenDialogs` (not a simplified placeholder). Use the line range to find and replace the block wholesale.

Replace the entire `{!chatsCollapsed && (...)}` block (currently lines ~447–533 in Sidebar.tsx) with:

```tsx
{!chatsCollapsed && (
  <>
    {!showHiddenDialogs && filteredGroups.length > 0 && (
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <button
          type="button"
          className="rounded px-2 py-0.5 text-xs text-text-soft hover:bg-hover hover:text-text"
          onClick={() => bulkSetActive(filteredGroups, true)}
          title="Activate all chats in current view"
        >
          Select all
        </button>
        <span className="text-xs text-border">·</span>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-xs text-text-soft hover:bg-hover hover:text-text"
          onClick={() => bulkSetActive(groups.filter((g) => g.active), false)}
          title="Deactivate all active chats"
        >
          Deselect all
        </button>
        <span className="ml-auto text-xs text-text-soft">
          {`${filteredGroups.filter((g) => g.active).length} / ${filteredGroups.length}`}
        </span>
      </div>
    )}
    <div className="flex-1 overflow-y-auto p-2">
      {showHiddenDialogs
        ? filteredHiddenDialogs.map((g) => (
            <div
              key={g.id}
              className="group flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-hover"
            >
              {g.type && CHAT_TYPE_ICONS[g.type] && (
                <ChatTypeIcon type={g.type} />
              )}
              <span className="flex-1 truncate text-text-soft">
                {g.name}
              </span>
              <button
                className="shrink-0 rounded p-1 text-text-soft opacity-0 hover:bg-surface-strong hover:text-success focus:opacity-100 group-hover:opacity-100"
                onClick={() => onUnhideDialog(g)}
                title="Unhide"
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
                </svg>
              </button>
            </div>
          ))
        : filteredGroups.map((g) => (
            <button
              type="button"
              key={g.id}
              className={`group mb-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                g.active
                  ? 'bg-hover/50 hover:bg-hover'
                  : 'opacity-50 hover:bg-hover hover:opacity-75'
              }`}
              onClick={() => toggleActive(g)}
              title={
                g.active ? 'Click to deactivate' : 'Click to activate'
              }
            >
              {g.type && CHAT_TYPE_ICONS[g.type] && (
                <ChatTypeIcon type={g.type} />
              )}
              {(g.media_count ?? 0) > 0 && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                  title={`${g.media_count} media synced`}
                />
              )}
              <span className="flex-1 truncate text-left">
                {g.name}
              </span>
              {syncStatuses[g.id]?.status === 'syncing' &&
                syncStatuses[g.id].total > 0 && (
                  <span className="ml-auto shrink-0 text-xs text-accent">
                    {syncStatuses[g.id].progress.toLocaleString()}
                    {' / '}
                    {syncStatuses[g.id].total.toLocaleString()}
                  </span>
                )}
              {syncStatuses[g.id]?.status !== 'syncing' &&
                previewCounts[String(g.id)]?.total != null &&
                previewCounts[String(g.id)]!.total > 0 && (
                  <span className="ml-auto shrink-0 rounded-full bg-surface-strong/60 px-1.5 py-0.5 text-[10px] text-text-soft">
                    ~
                    {previewCounts[
                      String(g.id)
                    ]!.total.toLocaleString()}{' '}
                    new
                  </span>
                )}
              <GroupOverflowMenu
                group={g}
                syncStatus={syncStatuses[g.id]}
                onHide={onHideDialog}
                onUnsync={onUnsyncGroup}
              />
            </button>
          ))}
    </div>
  </>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && bun run test src/components/__tests__/Sidebar.test.tsx
```

Expected: all tests PASS (including the 4 new ones and all existing ones)

- [ ] **Step 5: Run lint and format**

```bash
cd frontend && bun run check
```

Expected: no errors. Auto-fix any formatting issues it produces.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/components/Sidebar.tsx src/components/__tests__/Sidebar.test.tsx
git commit -m "feat: add select-all/deselect-all to sidebar chat list"
```

---

### Task 3: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd frontend && bun run test
```

Expected: all tests pass

- [ ] **Step 2: Run type check**

```bash
cd frontend && bun run check
```

Expected: no type errors

- [ ] **Step 3: Manual smoke test**

Start dev server: `cd frontend && bun run dev`

Verify these scenarios:
1. No filter active → "Select all" activates every chat; "Deselect all" clears all
2. `chat=dm` filter → "Select all" only activates DM chats; groups stay as-is
3. `chat=group` filter → "Select all" only activates group chats
4. Search query "foo" → "Select all" only activates matched chats
5. Count badge (e.g. `1 / 2`) updates live as chats are individually toggled
6. Hidden dialogs mode (`hiddenDialogs=true`) → action row is hidden (not applicable there)
7. No chats match current filter → action row is hidden entirely
