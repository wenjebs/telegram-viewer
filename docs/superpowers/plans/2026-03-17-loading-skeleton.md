# Loading Skeleton for Infinite-Scroll Grid

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Load more" button with shimmer skeleton placeholders that appear at the bottom of the virtualized grid while fetching the next page, giving smooth visual feedback for infinite scroll.

**Architecture:** Add a `SkeletonGroup` component that mimics the shape of a date-grouped row (header bar + grid of aspect-square cells with a shimmer animation). When `isFetchingNextPage` is true, render one skeleton group below the last real virtual row. The skeleton is not virtualized — it's a simple static element appended after the virtual container. A CSS `@keyframes shimmer` animation provides the loading effect using theme tokens.

**Tech Stack:** React, Tailwind CSS v4 (with custom `@keyframes`), existing theme tokens (`surface-alt`, `surface-strong`)

---

### Task 1: Add shimmer keyframes to CSS

**Files:**
- Modify: `frontend/src/styles.css:169-178`

- [ ] **Step 1: Add shimmer keyframe**

After the existing `@keyframes slideUp` block (line 178), add:

```css
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

- [ ] **Step 2: Verify CSS parses**

Run: `cd frontend && bun run check`
Expected: No errors related to styles.css

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.css
git commit -m "feat: add shimmer keyframe animation for loading skeletons"
```

---

### Task 2: Create SkeletonGroup component

**Files:**
- Create: `frontend/src/components/SkeletonGroup.tsx`
- Test: `frontend/src/components/__tests__/SkeletonGroup.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SkeletonGroup from '../SkeletonGroup'

describe('SkeletonGroup', () => {
  it('renders the expected number of skeleton cells', () => {
    const { container } = render(<SkeletonGroup columns={4} rows={2} />)
    const cells = container.querySelectorAll('[data-testid="skeleton-cell"]')
    expect(cells).toHaveLength(8)
  })

  it('renders a skeleton header bar', () => {
    render(<SkeletonGroup columns={3} rows={1} />)
    expect(
      screen.getByTestId('skeleton-header'),
    ).toBeInTheDocument()
  })

  it('applies shimmer animation via inline style', () => {
    const { container } = render(<SkeletonGroup columns={2} rows={1} />)
    const cell = container.querySelector(
      '[data-testid="skeleton-cell"]',
    ) as HTMLElement
    expect(cell?.style.animation).toContain('shimmer')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run vitest run src/components/__tests__/SkeletonGroup.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

```tsx
interface Props {
  columns: number
  rows: number
}

export default function SkeletonGroup({ columns, rows }: Props) {
  const count = columns * rows
  return (
    <div className="rounded-lg border border-border bg-surface/60 p-3">
      {/* Fake date header */}
      <div
        data-testid="skeleton-header"
        className="mb-2 h-5 w-24 rounded bg-surface-strong"
        style={{
          backgroundImage:
            'linear-gradient(90deg, transparent 0%, var(--color-surface-alt) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.8s ease-in-out infinite',
        }}
      />
      {/* Fake thumbnail grid — mirror the real grid's column layout */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            data-testid="skeleton-cell"
            className="aspect-square rounded bg-surface-strong"
            style={{
              backgroundImage:
                'linear-gradient(90deg, transparent 0%, var(--color-surface-alt) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: `shimmer 1.8s ease-in-out ${i * 0.05}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && bun run vitest run src/components/__tests__/SkeletonGroup.test.tsx`
Expected: PASS — 3 tests

- [ ] **Step 5: Run lint/format**

Run: `cd frontend && bun run check`
Expected: Clean or auto-fixed

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SkeletonGroup.tsx frontend/src/components/__tests__/SkeletonGroup.test.tsx
git commit -m "feat: add SkeletonGroup shimmer component for grid loading"
```

---

### Task 3: Integrate skeleton into MediaGrid, remove Load More button

**Files:**
- Modify: `frontend/src/components/MediaGrid.tsx:1-314`

- [ ] **Step 1: Write the test for skeleton visibility**

Create `frontend/src/components/__tests__/MediaGrid.skeleton.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import MediaGrid from '../MediaGrid'
import { makeMediaItem } from '#/test/fixtures'

// Stub ResizeObserver for jsdom
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// Mock use-long-press used by MediaCard
vi.mock('use-long-press', () => ({
  useLongPress: () => () => ({}),
}))

// Mock @tanstack/react-virtual since jsdom has no layout engine
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({
        index: i,
        start: i * 300,
        size: 300,
        key: String(i),
      })),
    getTotalSize: () => opts.count * 300,
    measureElement: vi.fn(),
    measure: vi.fn(),
  }),
}))

describe('MediaGrid skeleton', () => {
  it('shows skeleton when loading and hasMore', () => {
    render(
      <MediaGrid
        items={[makeMediaItem()]}
        hasMore={true}
        loading={true}
        onLoadMore={() => {}}
        onItemClick={() => {}}
        syncing={false}
        syncStatuses={{}}
      />,
    )
    expect(screen.getByTestId('skeleton-header')).toBeInTheDocument()
  })

  it('does not show skeleton when not loading', () => {
    render(
      <MediaGrid
        items={[makeMediaItem()]}
        hasMore={true}
        loading={false}
        onLoadMore={() => {}}
        onItemClick={() => {}}
        syncing={false}
        syncStatuses={{}}
      />,
    )
    expect(screen.queryByTestId('skeleton-header')).not.toBeInTheDocument()
  })

  it('does not render a Load more button', () => {
    render(
      <MediaGrid
        items={[makeMediaItem()]}
        hasMore={true}
        loading={false}
        onLoadMore={() => {}}
        onItemClick={() => {}}
        syncing={false}
        syncStatuses={{}}
      />,
    )
    expect(screen.queryByText('Load more')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run vitest run src/components/__tests__/MediaGrid.skeleton.test.tsx`
Expected: FAIL — skeleton not rendered yet, "Load more" still present

- [ ] **Step 3: Modify MediaGrid**

In `MediaGrid.tsx`, make these changes:

**3a. Add import** (after line 6):
```tsx
import SkeletonGroup from './SkeletonGroup'
```

**3b. Compute column count for skeleton** (after the `MIN_COL` const, ~line 93):
```tsx
const skeletonCols = useMemo(() => {
  if (containerWidth === 0) return 4
  const gridWidth = containerWidth - SCROLL_PADDING * 2 - ROW_PADDING * 2
  return Math.max(1, Math.floor((gridWidth + GAP) / (MIN_COL + GAP)))
}, [containerWidth])
```

**3c. Replace the "Load more" button** (lines 278-286) with skeleton:
```tsx
{hasMore && loading && (
  <div className="mt-4">
    <SkeletonGroup columns={skeletonCols} rows={2} />
  </div>
)}
```

This removes the `<button>` entirely and shows a skeleton group only while fetching.

- [ ] **Step 4: Run tests**

Run: `cd frontend && bun run vitest run src/components/__tests__/MediaGrid.skeleton.test.tsx`
Expected: PASS — 3 tests

- [ ] **Step 5: Update existing test that asserts "Load more"**

In `frontend/src/components/__tests__/MediaGrid.test.tsx`, replace the test at lines 73-77:

```tsx
  it('shows skeleton when loading with more pages', () => {
    const items = [makeMediaItem()]
    render(<MediaGrid items={items} {...defaultProps} hasMore loading />)
    expect(screen.getByTestId('skeleton-header')).toBeTruthy()
  })
```

This replaces the old `'shows Load more button when hasMore is true'` test with one that verifies the new skeleton behavior.

- [ ] **Step 6: Run full test suite and lint**

Run: `cd frontend && bun run check && bun run vitest run`
Expected: All pass, no regressions

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/MediaGrid.tsx frontend/src/components/__tests__/MediaGrid.test.tsx frontend/src/components/__tests__/MediaGrid.skeleton.test.tsx
git commit -m "feat: replace Load More button with shimmer skeleton placeholders"
```

---

### Task 4: Visual polish and initial-load skeleton

**Files:**
- Modify: `frontend/src/components/MediaGrid.tsx`

The initial page load (`query.isLoading`, before any items exist) currently shows nothing until data arrives. Add skeleton rows for this state too.

- [ ] **Step 1: Write the test**

Add to `MediaGrid.skeleton.test.tsx`:

```tsx
it('shows skeleton on initial load (no items yet)', () => {
  render(
    <MediaGrid
      items={[]}
      hasMore={true}
      loading={true}
      onLoadMore={() => {}}
      onItemClick={() => {}}
      syncing={false}
      syncStatuses={{}}
    />,
  )
  expect(screen.getByTestId('skeleton-header')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run vitest run src/components/__tests__/MediaGrid.skeleton.test.tsx`
Expected: FAIL — currently the empty+loading state falls through to EmptyState or syncing UI

- [ ] **Step 3: Add initial-load skeleton state**

In `MediaGrid.tsx`, modify the empty/syncing states section (~line 145). Before the `if (items.length === 0 && !loading)` check, add:

```tsx
// Initial load skeleton
if (items.length === 0 && loading) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      <SkeletonGroup columns={4} rows={2} />
      <SkeletonGroup columns={4} rows={3} />
      <SkeletonGroup columns={4} rows={2} />
    </div>
  )
}
```

This shows 3 skeleton groups (mimicking 3 date groups) while the first page loads.

- [ ] **Step 4: Run tests**

Run: `cd frontend && bun run vitest run src/components/__tests__/MediaGrid.skeleton.test.tsx`
Expected: PASS — 4 tests

- [ ] **Step 5: Run full suite and lint**

Run: `cd frontend && bun run check && bun run vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MediaGrid.tsx frontend/src/components/__tests__/MediaGrid.skeleton.test.tsx
git commit -m "feat: add initial-load skeleton state for empty grid"
```

---

### Task 5: Manual visual QA

**Files:** None (verification only)

- [ ] **Step 1: Start dev server**

Run: `cd frontend && bun run dev`

- [ ] **Step 2: Verify initial-load skeleton**

Open the app in a browser. On first load, 3 shimmer skeleton groups should appear briefly before real content loads. Verify:
- Skeleton cells are aspect-square
- Shimmer animation sweeps left-to-right
- Skeleton matches the grid column count at the current viewport width
- Transitions smoothly to real content

- [ ] **Step 3: Verify infinite-scroll skeleton**

Scroll to the bottom of the grid. When the next page is fetching, a skeleton group should appear below the last real date group. Verify:
- No "Load more" button anywhere
- Skeleton appears immediately when fetch starts
- Skeleton disappears when new items render
- Column count matches the real grid

- [ ] **Step 4: Verify responsive behavior**

Resize the viewport. Skeleton column count should adjust to match the real grid's `auto-fill` column count.

- [ ] **Step 5: Verify both themes**

Toggle between dark and light themes. Skeleton colors should use `surface-strong` / `surface-alt` tokens and look appropriate in both.
