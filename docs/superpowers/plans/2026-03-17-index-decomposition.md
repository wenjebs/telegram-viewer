# index.tsx Decomposition Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `frontend/src/routes/index.tsx` (957 lines) into focused hooks and components, targeting ~450 lines with each extraction independently testable.

**Architecture:** Extract 4 custom hooks for logic and 3 components for JSX sections. The `Home` component remains the orchestrator, wiring hooks to components via props. No state management library needed — existing TanStack Query + URL params + useState covers all cases.

**Tech Stack:** React 19, TanStack Query v5, TanStack Router, Vitest, React Testing Library

---

## File Structure

### New files to create:
| File | Responsibility | ~Lines |
|------|---------------|--------|
| `src/hooks/useCountQueries.ts` | 4 count queries + invalidation helpers | ~50 |
| `src/hooks/useHiddenDialogs.ts` | Hidden dialog state, fetch, toggle, hide/unhide handlers | ~80 |
| `src/hooks/useActiveMedia.ts` | Selects active media source, derives sorted items/loading/hasMore | ~50 |
| `src/hooks/useViewHandlers.ts` | handleClear, handleViewModeChange, handleHideDialog etc. | ~90 |
| `src/components/ViewModeHeader.tsx` | Header bar with icon, title, similarity input, select/close buttons | ~110 |
| `src/components/ActiveGroupsBar.tsx` | Syncing group chips with filter toggle and deactivate | ~60 |
| `src/components/PersonMergeBar.tsx` | Bottom bar for person merge selection | ~50 |

### Files to modify:
| File | Change |
|------|--------|
| `src/routes/index.tsx` | Replace extracted code with hook calls and component usage |

### Existing test files to update/create:
| File | What |
|------|------|
| `src/hooks/__tests__/useCountQueries.test.ts` | New |
| `src/hooks/__tests__/useHiddenDialogs.test.ts` | New |
| `src/hooks/__tests__/useActiveMedia.test.ts` | New |
| `src/components/__tests__/ViewModeHeader.test.tsx` | New |
| `src/components/__tests__/ActiveGroupsBar.test.tsx` | New |
| `src/components/__tests__/PersonMergeBar.test.tsx` | New |

---

## Task 1: Extract `useCountQueries` hook

**Files:**
- Create: `src/hooks/useCountQueries.ts`
- Create: `src/hooks/__tests__/useCountQueries.test.ts`
- Modify: `src/routes/index.tsx`

This hook encapsulates the 4 count queries (hidden, favorites, total, hiddenDialogs) and the `invalidateCounts` + `invalidateActiveMedia` helpers.

- [ ] **Step 1: Create the hook**

Extract from `index.tsx` lines 122-141 (count queries) and lines 301-312 (invalidation helpers).

```typescript
// src/hooks/useCountQueries.ts
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getHiddenCount,
  getFavoritesCount,
  getMediaCount,
  getHiddenDialogCount,
} from '#/api/client'

export function useCountQueries(options: {
  enabled: boolean
  selectedPersonId?: number | null
}) {
  const queryClient = useQueryClient()
  const { enabled, selectedPersonId } = options

  const { data: hiddenCount = 0 } = useQuery({
    queryKey: ['counts', 'hidden'],
    queryFn: () => getHiddenCount().then((r) => r.count),
    enabled,
  })
  const { data: favoritesCount = 0 } = useQuery({
    queryKey: ['counts', 'favorites'],
    queryFn: () => getFavoritesCount().then((r) => r.count),
    enabled,
  })
  const { data: totalCount = 0 } = useQuery({
    queryKey: ['counts', 'total'],
    queryFn: () => getMediaCount().then((r) => r.count),
    enabled,
  })
  const { data: hiddenDialogCount = 0 } = useQuery({
    queryKey: ['counts', 'hiddenDialogs'],
    queryFn: () => getHiddenDialogCount().then((r) => r.count),
    enabled,
  })

  const invalidateCounts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['counts'] }),
    [queryClient],
  )

  const invalidateActiveMedia = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['media'] })
    if (selectedPersonId) {
      queryClient.invalidateQueries({
        queryKey: ['faces', 'persons', selectedPersonId, 'media'],
      })
    }
  }, [queryClient, selectedPersonId])

  return {
    hiddenCount,
    favoritesCount,
    totalCount,
    hiddenDialogCount,
    invalidateCounts,
    invalidateActiveMedia,
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
// src/hooks/__tests__/useCountQueries.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '#/test/wrapper'
import { mockFetch } from '#/test/fetch-mock'
import { useCountQueries } from '#/hooks/useCountQueries'

describe('useCountQueries', () => {
  it('fetches all counts when enabled', async () => {
    mockFetch({
      '/api/media/hidden/count': { count: 3 },
      '/api/media/favorites/count': { count: 5 },
      '/api/media/count': { count: 100 },
      '/api/groups/hidden/count': { count: 2 },
    })
    const { result } = renderHook(
      () => useCountQueries({ enabled: true }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.hiddenCount).toBe(3)
      expect(result.current.favoritesCount).toBe(5)
      expect(result.current.totalCount).toBe(100)
      expect(result.current.hiddenDialogCount).toBe(2)
    })
  })

  it('does not fetch when disabled', () => {
    const fn = mockFetch({})
    renderHook(
      () => useCountQueries({ enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(fn).not.toHaveBeenCalled()
  })

  it('returns zero defaults before data loads', () => {
    mockFetch({})
    const { result } = renderHook(
      () => useCountQueries({ enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(result.current.hiddenCount).toBe(0)
    expect(result.current.favoritesCount).toBe(0)
    expect(result.current.totalCount).toBe(0)
    expect(result.current.hiddenDialogCount).toBe(0)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `cd frontend && bun run test -- src/hooks/__tests__/useCountQueries.test.ts`
Expected: PASS

- [ ] **Step 4: Update index.tsx to use the hook**

Replace the 4 individual `useQuery` calls (lines 122-141) and the invalidation helpers (lines 301-312) with:

```typescript
const {
  hiddenCount,
  favoritesCount,
  totalCount,
  hiddenDialogCount,
  invalidateCounts,
  invalidateActiveMedia,
} = useCountQueries({
  enabled: authenticated === true,
  selectedPersonId: selectedPerson?.id,
})
```

Remove imports: `getHiddenCount`, `getFavoritesCount`, `getMediaCount`, `getHiddenDialogCount` (from `#/api/client`).
Add import: `useCountQueries` from `#/hooks/useCountQueries`.

- [ ] **Step 5: Run full test suite**

Run: `cd frontend && bun run test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useCountQueries.ts frontend/src/hooks/__tests__/useCountQueries.test.ts frontend/src/routes/index.tsx
git commit -m "refactor: extract useCountQueries hook from index.tsx"
```

---

## Task 2: Extract `useHiddenDialogs` hook

**Files:**
- Create: `src/hooks/useHiddenDialogs.ts`
- Create: `src/hooks/__tests__/useHiddenDialogs.test.ts`
- Modify: `src/routes/index.tsx`

This hook encapsulates hidden dialog state, lazy-loading, toggle, hide/unhide handlers. Extracted from index.tsx lines 121 (`hiddenDialogs` state), 137-141 (`hiddenDialogCount` query — now via useCountQueries), 205-209 (`setShowHiddenDialogs`), 379-403 (effects), 485-524 (handlers).

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useHiddenDialogs.ts
import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import {
  hideDialog,
  unhideDialog,
  getHiddenDialogs,
} from '#/api/client'
import type { Group } from '#/api/schemas'

export function useHiddenDialogs(options: {
  showHiddenDialogs: boolean
  setShowHiddenDialogs: (v: boolean) => void
  refetchGroups: () => void
  invalidateCounts: () => void
}) {
  const {
    showHiddenDialogs,
    setShowHiddenDialogs,
    refetchGroups,
    invalidateCounts,
  } = options
  const queryClient = useQueryClient()
  const [hiddenDialogs, setHiddenDialogs] = useState<Group[]>([])

  // Fetch hidden dialogs when URL says hiddenDialogs=1 on load
  useEffect(() => {
    if (showHiddenDialogs && hiddenDialogs.length === 0) {
      getHiddenDialogs()
        .then(setHiddenDialogs)
        .catch(() => {
          toast.error('Failed to load hidden dialogs')
          setHiddenDialogs([])
        })
    }
  }, [showHiddenDialogs]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleHiddenDialogs = useCallback(async () => {
    const next = !showHiddenDialogs
    setShowHiddenDialogs(next)
    if (next) {
      try {
        const dialogs = await getHiddenDialogs()
        setHiddenDialogs(dialogs)
      } catch {
        toast.error('Failed to load hidden dialogs')
        setHiddenDialogs([])
      }
    }
  }, [showHiddenDialogs, setShowHiddenDialogs])

  const handleHideDialog = useCallback(
    async (group: Group) => {
      try {
        await hideDialog(group.id)
      } catch {
        toast.error('Failed to hide dialog')
        return
      }
      toast.success(`${group.name} hidden`)
      refetchGroups()
      queryClient.invalidateQueries({ queryKey: ['media'] })
      invalidateCounts()
    },
    [refetchGroups, queryClient, invalidateCounts],
  )

  const handleUnhideDialog = useCallback(
    async (group: Group) => {
      try {
        await unhideDialog(group.id)
      } catch {
        toast.error('Failed to unhide dialog')
        return
      }
      toast.success(`${group.name} unhidden`)
      setHiddenDialogs((prev) => prev.filter((g) => g.id !== group.id))
      refetchGroups()
      queryClient.invalidateQueries({ queryKey: ['media'] })
      invalidateCounts()
    },
    [refetchGroups, queryClient, invalidateCounts],
  )

  return {
    hiddenDialogs,
    handleToggleHiddenDialogs,
    handleHideDialog,
    handleUnhideDialog,
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
// src/hooks/__tests__/useHiddenDialogs.test.ts
import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import { createWrapper } from '#/test/wrapper'
import { mockFetch, mockFetchError } from '#/test/fetch-mock'
import { makeGroup } from '#/test/fixtures'
import { useHiddenDialogs } from '#/hooks/useHiddenDialogs'

const defaultOptions = () => ({
  showHiddenDialogs: false,
  setShowHiddenDialogs: vi.fn(),
  refetchGroups: vi.fn(),
  invalidateCounts: vi.fn(),
})

describe('useHiddenDialogs', () => {
  it('starts with empty hiddenDialogs', () => {
    const { result } = renderHook(
      () => useHiddenDialogs(defaultOptions()),
      { wrapper: createWrapper() },
    )
    expect(result.current.hiddenDialogs).toEqual([])
  })

  it('handleToggleHiddenDialogs fetches dialogs when opening', async () => {
    const groups = [makeGroup({ id: 1, name: 'Hidden1' })]
    mockFetch({ '/api/groups/hidden': groups })
    const opts = defaultOptions()
    const { result } = renderHook(
      () => useHiddenDialogs(opts),
      { wrapper: createWrapper() },
    )
    await act(() => result.current.handleToggleHiddenDialogs())
    expect(opts.setShowHiddenDialogs).toHaveBeenCalledWith(true)
    expect(result.current.hiddenDialogs).toEqual(groups)
  })

  it('handleHideDialog calls API and refetches', async () => {
    mockFetch({ '/api/groups/1/hide': { success: true } })
    const opts = defaultOptions()
    const { result } = renderHook(
      () => useHiddenDialogs(opts),
      { wrapper: createWrapper() },
    )
    await act(() => result.current.handleHideDialog(makeGroup({ id: 1, name: 'G1' })))
    expect(opts.refetchGroups).toHaveBeenCalled()
    expect(opts.invalidateCounts).toHaveBeenCalled()
  })

  it('handleHideDialog shows error toast on failure', async () => {
    mockFetchError('/api/groups/1/hide', 500)
    const opts = defaultOptions()
    const { result } = renderHook(
      () => useHiddenDialogs(opts),
      { wrapper: createWrapper() },
    )
    await act(() => result.current.handleHideDialog(makeGroup({ id: 1, name: 'G1' })))
    expect(opts.refetchGroups).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests**

Run: `cd frontend && bun run test -- src/hooks/__tests__/useHiddenDialogs.test.ts`
Expected: PASS

- [ ] **Step 4: Update index.tsx**

Replace the `hiddenDialogs` state, the `handleToggleHiddenDialogs`/`handleHideDialog`/`handleUnhideDialog` handlers, and the `useEffect` for fetching hidden dialogs on load (lines 379-388) with:

```typescript
const {
  hiddenDialogs,
  handleToggleHiddenDialogs,
  handleHideDialog,
  handleUnhideDialog,
} = useHiddenDialogs({
  showHiddenDialogs,
  setShowHiddenDialogs,
  refetchGroups,
  invalidateCounts,
})
```

Remove imports: `hideDialog`, `unhideDialog`, `getHiddenDialogs` from `#/api/client`.
Add import: `useHiddenDialogs` from `#/hooks/useHiddenDialogs`.
The "fetch hidden dialogs on load" `useEffect` (lines 379-388) is already included in the hook implementation above.

- [ ] **Step 5: Run full test suite and commit**

Run: `cd frontend && bun run test`

```bash
git add frontend/src/hooks/useHiddenDialogs.ts frontend/src/hooks/__tests__/useHiddenDialogs.test.ts frontend/src/routes/index.tsx
git commit -m "refactor: extract useHiddenDialogs hook from index.tsx"
```

---

## Task 3: Extract `useActiveMedia` hook

**Files:**
- Create: `src/hooks/useActiveMedia.ts`
- Create: `src/hooks/__tests__/useActiveMedia.test.ts`
- Modify: `src/routes/index.tsx`

Encapsulates the logic that selects the right media source based on viewMode and derives sorted activeItems. Extracted from index.tsx lines 280-296.

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useActiveMedia.ts
import { useMemo } from 'react'
import type { MediaItem } from '#/api/schemas'

interface MediaSource {
  items: MediaItem[]
  loading: boolean
  hasMore: boolean
  fetchNextPage: () => void
  removeItem?: (id: number) => void
  removeItems: (ids: number[]) => void
}

export function useActiveMedia(options: {
  viewMode: string
  selectedPerson: { id: number } | null
  media: MediaSource
  hidden: MediaSource
  favorites: MediaSource
  personMedia: MediaSource
}) {
  const { viewMode, selectedPerson, media, hidden, favorites, personMedia } =
    options

  const activeSource =
    viewMode === 'hidden'
      ? hidden
      : viewMode === 'favorites'
        ? favorites
        : viewMode === 'people' && selectedPerson
          ? personMedia
          : media

  const activeItems = useMemo(
    () =>
      [...activeSource.items].toSorted((a, b) =>
        b.date.localeCompare(a.date),
      ),
    [activeSource.items],
  )

  return {
    activeSource,
    activeItems,
    activeLoading: activeSource.loading,
    activeHasMore: activeSource.hasMore,
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
// src/hooks/__tests__/useActiveMedia.test.ts
import { renderHook } from '@testing-library/react'
import { makeMediaItem } from '#/test/fixtures'
import { useActiveMedia } from '#/hooks/useActiveMedia'
import { vi } from 'vitest'

const makeSource = (items = []) => ({
  items,
  loading: false,
  hasMore: false,
  fetchNextPage: vi.fn(),
  removeItems: vi.fn(),
})

describe('useActiveMedia', () => {
  it('selects media source for normal mode', () => {
    const media = makeSource([makeMediaItem({ id: 1 })])
    const { result } = renderHook(() =>
      useActiveMedia({
        viewMode: 'normal',
        selectedPerson: null,
        media,
        hidden: makeSource(),
        favorites: makeSource(),
        personMedia: makeSource(),
      }),
    )
    expect(result.current.activeItems).toHaveLength(1)
    expect(result.current.activeSource).toBe(media)
  })

  it('selects hidden source for hidden mode', () => {
    const hidden = makeSource([makeMediaItem({ id: 2 })])
    const { result } = renderHook(() =>
      useActiveMedia({
        viewMode: 'hidden',
        selectedPerson: null,
        media: makeSource(),
        hidden,
        favorites: makeSource(),
        personMedia: makeSource(),
      }),
    )
    expect(result.current.activeSource).toBe(hidden)
  })

  it('selects favorites source for favorites mode', () => {
    const favorites = makeSource([makeMediaItem({ id: 3 })])
    const { result } = renderHook(() =>
      useActiveMedia({
        viewMode: 'favorites',
        selectedPerson: null,
        media: makeSource(),
        hidden: makeSource(),
        favorites,
        personMedia: makeSource(),
      }),
    )
    expect(result.current.activeSource).toBe(favorites)
  })

  it('selects personMedia when people mode with selected person', () => {
    const personMedia = makeSource([makeMediaItem({ id: 4 })])
    const { result } = renderHook(() =>
      useActiveMedia({
        viewMode: 'people',
        selectedPerson: { id: 1 },
        media: makeSource(),
        hidden: makeSource(),
        favorites: makeSource(),
        personMedia,
      }),
    )
    expect(result.current.activeSource).toBe(personMedia)
  })

  it('falls back to media in people mode without selected person', () => {
    const media = makeSource()
    const { result } = renderHook(() =>
      useActiveMedia({
        viewMode: 'people',
        selectedPerson: null,
        media,
        hidden: makeSource(),
        favorites: makeSource(),
        personMedia: makeSource(),
      }),
    )
    expect(result.current.activeSource).toBe(media)
  })

  it('sorts items by date descending', () => {
    const items = [
      makeMediaItem({ id: 1, date: '2026-03-10T10:00:00' }),
      makeMediaItem({ id: 2, date: '2026-03-15T10:00:00' }),
      makeMediaItem({ id: 3, date: '2026-03-12T10:00:00' }),
    ]
    const { result } = renderHook(() =>
      useActiveMedia({
        viewMode: 'normal',
        selectedPerson: null,
        media: makeSource(items),
        hidden: makeSource(),
        favorites: makeSource(),
        personMedia: makeSource(),
      }),
    )
    expect(result.current.activeItems.map((i) => i.id)).toEqual([2, 3, 1])
  })
})
```

- [ ] **Step 3: Run tests**

Run: `cd frontend && bun run test -- src/hooks/__tests__/useActiveMedia.test.ts`
Expected: PASS

- [ ] **Step 4: Update index.tsx**

Replace the `activeSource` / `activeItems` / `activeLoading` / `activeHasMore` block (lines 280-296) with:

```typescript
const { activeSource, activeItems, activeLoading, activeHasMore } =
  useActiveMedia({
    viewMode,
    selectedPerson,
    media,
    hidden,
    favorites,
    personMedia,
  })
```

- [ ] **Step 5: Run full test suite and commit**

Run: `cd frontend && bun run test`

```bash
git add frontend/src/hooks/useActiveMedia.ts frontend/src/hooks/__tests__/useActiveMedia.test.ts frontend/src/routes/index.tsx
git commit -m "refactor: extract useActiveMedia hook from index.tsx"
```

---

## Task 4: Extract `ViewModeHeader` component

**Files:**
- Create: `src/components/ViewModeHeader.tsx`
- Create: `src/components/__tests__/ViewModeHeader.test.tsx`
- Modify: `src/routes/index.tsx`

The header bar shown for non-normal view modes (lines 609-710). Shows icon, title, similarity threshold input (people mode), select button, and close button.

- [ ] **Step 1: Create the component**

Extract the JSX from index.tsx lines 609-710 into a standalone component. Props are everything the JSX references:

```typescript
// src/components/ViewModeHeader.tsx
import type { Person } from '#/api/schemas'

interface Props {
  viewMode: 'hidden' | 'favorites' | 'people'
  selectedPerson: Person | null
  similarityThreshold: number
  onSimilarityChange: (v: number) => void
  personMergeActive: boolean
  onEnterPersonMerge: () => void
  onExitPersonMerge: () => void
  onClose: () => void
}

export default function ViewModeHeader({
  viewMode,
  selectedPerson,
  similarityThreshold,
  onSimilarityChange,
  personMergeActive,
  onEnterPersonMerge,
  onExitPersonMerge,
  onClose,
}: Props) {
  // ... extract the JSX block from index.tsx lines 610-710
  // The close button calls onExitPersonMerge if personMergeActive, else onClose
}
```

- [ ] **Step 2: Write tests**

Test key rendering behaviors: shows correct icon/title per viewMode, shows similarity input in people mode without selectedPerson, shows select button, close button calls correct handler.

- [ ] **Step 3: Run tests, update index.tsx, run full suite, commit**

Replace the inline JSX block with `<ViewModeHeader ... />`. Remove ~100 lines from index.tsx.

```bash
git add frontend/src/components/ViewModeHeader.tsx frontend/src/components/__tests__/ViewModeHeader.test.tsx frontend/src/routes/index.tsx
git commit -m "refactor: extract ViewModeHeader component from index.tsx"
```

---

## Task 5: Extract `ActiveGroupsBar` component

**Files:**
- Create: `src/components/ActiveGroupsBar.tsx`
- Create: `src/components/__tests__/ActiveGroupsBar.test.tsx`
- Modify: `src/routes/index.tsx`

The syncing group chips bar (lines 712-760). Shows active groups as filterable chips with deactivate buttons.

- [ ] **Step 1: Create the component**

```typescript
// src/components/ActiveGroupsBar.tsx
import type { Group } from '#/api/schemas'

interface Props {
  groups: Group[]
  displayGroupIds: Set<number>
  onToggleDisplayFilter: (id: number) => void
  onToggleActive: (group: Group) => void
  onClearDisplayFilter: () => void
}

export default function ActiveGroupsBar({
  groups,
  displayGroupIds,
  onToggleDisplayFilter,
  onToggleActive,
  onClearDisplayFilter,
}: Props) {
  const activeGroups = groups.filter((g) => g.active)
  if (activeGroups.length === 0) return null
  // ... extract JSX from lines 713-759
}
```

- [ ] **Step 2: Write tests, update index.tsx, commit**

Test: renders chips for active groups, clicking chip calls onToggleDisplayFilter, clicking ✕ calls onToggleActive, "Show all" visible when displayGroupIds non-empty.

```bash
git add frontend/src/components/ActiveGroupsBar.tsx frontend/src/components/__tests__/ActiveGroupsBar.test.tsx frontend/src/routes/index.tsx
git commit -m "refactor: extract ActiveGroupsBar component from index.tsx"
```

---

## Task 6: Extract `PersonMergeBar` component

**Files:**
- Create: `src/components/PersonMergeBar.tsx`
- Create: `src/components/__tests__/PersonMergeBar.test.tsx`
- Modify: `src/routes/index.tsx`

The bottom merge selection bar (lines 880-922). Shows selected count, select all/deselect, merge button.

- [ ] **Step 1: Create the component**

```typescript
// src/components/PersonMergeBar.tsx
import type { Person } from '#/api/schemas'

interface Props {
  selectedCount: number
  merging: boolean
  onSelectAll: (persons: Person[]) => void
  persons: Person[]
  onDeselectAll: () => void
  onMerge: () => void
  onCancel: () => void
}

export default function PersonMergeBar({ ... }: Props) {
  // ... extract JSX from lines 881-922
}
```

- [ ] **Step 2: Write tests, update index.tsx, commit**

Test: displays count, merge button disabled when <2 selected, merge button calls onMerge, cancel calls onCancel.

```bash
git add frontend/src/components/PersonMergeBar.tsx frontend/src/components/__tests__/PersonMergeBar.test.tsx frontend/src/routes/index.tsx
git commit -m "refactor: extract PersonMergeBar component from index.tsx"
```

---

## Task 7: Final cleanup and verification

**Files:**
- Modify: `src/routes/index.tsx` (final review)

- [ ] **Step 1: Review index.tsx line count**

Run: `wc -l frontend/src/routes/index.tsx`
Expected: ~450 lines (down from 957)

- [ ] **Step 2: Run full test suite**

Run: `cd frontend && bun run test`
Expected: All tests pass

- [ ] **Step 3: Run lint**

Run: `cd frontend && bun run check`
Expected: No errors

- [ ] **Step 4: Verify the app still works**

Run: `cd frontend && bun run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git commit -m "refactor: final cleanup after index.tsx decomposition"
```

---

## Summary of line impact

| Extraction | Lines removed from index.tsx |
|---|---|
| useCountQueries | ~40 |
| useHiddenDialogs | ~80 |
| useActiveMedia | ~25 |
| ViewModeHeader | ~100 |
| ActiveGroupsBar | ~50 |
| PersonMergeBar | ~45 |
| Import cleanup | ~15 |
| Replaced with hook/component calls | +25 |
| **Net reduction** | **~330 lines** |
| **Final index.tsx** | **~450 lines** |
