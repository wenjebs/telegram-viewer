# Lightbox Pagination Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow lightbox prev/next navigation to continue past page boundaries by triggering pagination when the user approaches the end of loaded items.

**Architecture:** Add a `useEffect` in `useHomeData` that calls `fetchNextPage()` when the lightbox selection index is within 10 items of the boundary. Update the `hasNext` prop in `index.tsx` to stay enabled while more pages exist.

**Tech Stack:** React 19, TanStack Query, Vitest + React Testing Library

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/hooks/useHomeData.ts` | Modify (add effect at line 311) | Trigger `fetchNextPage()` when lightbox index nears boundary |
| `frontend/src/hooks/__tests__/useHomeData.test.ts` | Modify | Add test for lookahead pagination trigger |
| `frontend/src/routes/index.tsx` | Modify (line 393) | Update `hasNext` to account for `hasMore` |

---

### Task 1: Add Lookahead Pagination Effect

**Files:**
- Modify: `frontend/src/hooks/__tests__/useHomeData.test.ts`
- Modify: `frontend/src/hooks/useHomeData.ts`

- [ ] **Step 1: Write failing test for lightbox lookahead pagination**

Add to the existing `describe('useHomeData', ...)` block in `frontend/src/hooks/__tests__/useHomeData.test.ts`:

```tsx
import { useLightbox } from '#/hooks/useLightbox'

// ... inside the describe block:

it('calls fetchNextPage when lightbox index is within 10 of boundary', () => {
  const fetchNextPage = vi.fn()
  const items = Array.from({ length: 50 }, (_, i) =>
    makeMediaItem({ id: i + 1, date: `2026-01-${String(50 - i).padStart(2, '0')}T00:00:00Z` }),
  )
  ;(useMedia as Mock).mockReturnValue({
    ...mockMediaReturn(items),
    hasMore: true,
    fetchNextPage,
  })
  // Simulate lightbox at item index 42 (within 10 of end at 50)
  ;(useLightbox as Mock).mockReturnValue({
    selectedItem: items[42],
    setSelectedItem: vi.fn(),
    selectedIndex: 42,
    justClosedLightboxRef: { current: false },
    handlePrev: vi.fn(),
    handleNext: vi.fn(),
    handleClose: vi.fn(),
    handleToggleSelect: vi.fn(),
    handleHide: vi.fn(),
    handleUnhide: vi.fn(),
    handleToggleFavorite: vi.fn(),
  })

  renderHook(() => useHomeData(), {
    wrapper: createWrapper(),
  })

  expect(fetchNextPage).toHaveBeenCalled()
})

it('does not call fetchNextPage when lightbox is far from boundary', () => {
  const fetchNextPage = vi.fn()
  const items = Array.from({ length: 50 }, (_, i) =>
    makeMediaItem({ id: i + 1, date: `2026-01-${String(50 - i).padStart(2, '0')}T00:00:00Z` }),
  )
  ;(useMedia as Mock).mockReturnValue({
    ...mockMediaReturn(items),
    hasMore: true,
    fetchNextPage,
  })
  // Simulate lightbox at item index 10 (far from end)
  ;(useLightbox as Mock).mockReturnValue({
    selectedItem: items[10],
    setSelectedItem: vi.fn(),
    selectedIndex: 10,
    justClosedLightboxRef: { current: false },
    handlePrev: vi.fn(),
    handleNext: vi.fn(),
    handleClose: vi.fn(),
    handleToggleSelect: vi.fn(),
    handleHide: vi.fn(),
    handleUnhide: vi.fn(),
    handleToggleFavorite: vi.fn(),
  })

  renderHook(() => useHomeData(), {
    wrapper: createWrapper(),
  })

  expect(fetchNextPage).not.toHaveBeenCalled()
})
```

Note: `useLightbox` is already imported at the top of the test file via `vi.mock('#/hooks/useLightbox', ...)`. Add it to the re-import section (around line 156) so we can control it per-test:

```tsx
import { useLightbox } from '#/hooks/useLightbox'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/hooks/__tests__/useHomeData.test.ts`
Expected: FAIL — `fetchNextPage` is not called (no effect exists yet)

- [ ] **Step 3: Add the lookahead effect to useHomeData**

In `frontend/src/hooks/useHomeData.ts`, add after line 310 (inside the `#region Effects` section, before `// #endregion`):

```tsx
  // Trigger pagination when lightbox navigation approaches the boundary
  useEffect(() => {
    if (
      lightbox.selectedIndex >= 0 &&
      activeItems.length - lightbox.selectedIndex <= 10 &&
      activeHasMore
    ) {
      activeSource.fetchNextPage()
    }
  }, [lightbox.selectedIndex, activeItems.length, activeHasMore, activeSource])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/hooks/__tests__/useHomeData.test.ts`
Expected: PASS

- [ ] **Step 5: Run lint/format**

Run: `cd frontend && bun run check`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useHomeData.ts frontend/src/hooks/__tests__/useHomeData.test.ts
git commit -m "feat: trigger pagination when lightbox nears page boundary"
```

---

### Task 2: Update hasNext to Account for hasMore

**Files:**
- Modify: `frontend/src/routes/index.tsx` (line 393)

- [ ] **Step 1: Update the hasNext prop**

In `frontend/src/routes/index.tsx`, change line 393 from:

```tsx
hasNext={data.lightbox.selectedIndex < data.activeItems.length - 1}
```

To:

```tsx
hasNext={data.lightbox.selectedIndex < data.activeItems.length - 1 || data.activeHasMore}
```

This keeps the next button enabled while there are more pages to load, even if the user is on the last loaded item. `handleNext` in `useLightbox` already guards against out-of-bounds array access, so pressing next at the true boundary is a no-op until the next page arrives.

- [ ] **Step 2: Run full test suite**

Run: `cd frontend && bun run test`
Expected: All tests pass

- [ ] **Step 3: Run type check**

Run: `cd frontend && bunx tsgo --noEmit`
Expected: No new type errors

- [ ] **Step 4: Run lint/format**

Run: `cd frontend && bun run check`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/index.tsx
git commit -m "feat: keep lightbox next button enabled while more pages exist"
```
