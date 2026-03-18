# Sidebar Layout Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce sidebar cognitive overload by moving view mode controls to main content tabs, grouping related filters into a collapsible disclosure, and adding danger styling to the Clear button.

**Architecture:** Three changes: (1) Extract view mode buttons (Hidden, Favorites, People) from sidebar footer into a horizontal tab strip at the top of the main content area — this is the biggest declutter win. (2) Wrap media type, faces, and date range filters into a single collapsible "Filters" disclosure section. (3) Make the Clear button visually distinct with danger styling. The Scan Faces button moves to the people mode sub-header in the main content area since it's view-mode-specific.

**Tech Stack:** React 19, Tailwind CSS v4, TanStack Router/Start, Vitest + React Testing Library

**Stack conventions:**
- Package manager: `bun`
- Format/lint: `bun run check` (oxfmt + oxlint)
- Type check: `bunx --bun tsgo` (not tsc)
- Tests: `bun run test` or `bun vitest run <file>`
- Import alias: `#/*` for `./src/*`
- No `import React` — React 19 JSX transform handles it
- Design tokens in `frontend/src/styles.css` as CSS custom properties (`--th-*` -> `--color-*`)
- Theme tokens as Tailwind classes: `text-text`, `bg-surface`, `bg-hover`, `border-border`, `bg-accent`, etc.

---

## Task 1: Create ViewModeTabs Component

Extract view mode switching into a standalone horizontal tab strip component. This component renders four tabs: Gallery, Hidden, Favorites, People — each with an optional count badge.

**Files:**
- Create: `frontend/src/components/ViewModeTabs.tsx`
- Create: `frontend/src/components/__tests__/ViewModeTabs.test.tsx`

### Steps

- [ ] **Step 1: Write the test file**

```tsx
// frontend/src/components/__tests__/ViewModeTabs.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import ViewModeTabs from '#/components/ViewModeTabs'

const defaultProps = {
  viewMode: 'normal' as const,
  onViewModeChange: vi.fn(),
}

describe('ViewModeTabs', () => {
  it('renders all four tabs', () => {
    render(<ViewModeTabs {...defaultProps} />)
    expect(screen.getByRole('tab', { name: /gallery/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /hidden/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /favorites/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /people/i })).toBeTruthy()
  })

  it('marks the active tab as selected', () => {
    render(<ViewModeTabs {...defaultProps} viewMode="favorites" />)
    expect(
      screen.getByRole('tab', { name: /favorites/i }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('tab', { name: /gallery/i }),
    ).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onViewModeChange when a tab is clicked', () => {
    const onViewModeChange = vi.fn()
    render(
      <ViewModeTabs {...defaultProps} onViewModeChange={onViewModeChange} />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /hidden/i }))
    expect(onViewModeChange).toHaveBeenCalledWith('hidden')
  })

  it('toggles back to normal when clicking the active tab', () => {
    const onViewModeChange = vi.fn()
    render(
      <ViewModeTabs
        {...defaultProps}
        viewMode="hidden"
        onViewModeChange={onViewModeChange}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /hidden/i }))
    expect(onViewModeChange).toHaveBeenCalledWith('normal')
  })

  it('shows count badges when provided', () => {
    render(
      <ViewModeTabs
        {...defaultProps}
        hiddenCount={5}
        favoritesCount={12}
        personCount={3}
      />,
    )
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('does not show badges for zero counts', () => {
    render(
      <ViewModeTabs
        {...defaultProps}
        hiddenCount={0}
        favoritesCount={0}
        personCount={0}
      />,
    )
    expect(screen.queryByText('0')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && bun vitest run src/components/__tests__/ViewModeTabs.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ViewModeTabs**

```tsx
// frontend/src/components/ViewModeTabs.tsx
type ViewMode = 'normal' | 'hidden' | 'favorites' | 'people'

interface Props {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  hiddenCount?: number
  favoritesCount?: number
  personCount?: number
}

const TABS: { mode: ViewMode; label: string; countKey?: keyof Props }[] = [
  { mode: 'normal', label: 'Gallery' },
  { mode: 'hidden', label: 'Hidden', countKey: 'hiddenCount' },
  { mode: 'favorites', label: 'Favorites', countKey: 'favoritesCount' },
  { mode: 'people', label: 'People', countKey: 'personCount' },
]

export default function ViewModeTabs({
  viewMode,
  onViewModeChange,
  hiddenCount = 0,
  favoritesCount = 0,
  personCount = 0,
}: Props) {
  const counts: Record<string, number> = {
    hiddenCount,
    favoritesCount,
    personCount,
  }

  return (
    <div
      className="flex border-b border-border bg-surface"
      role="tablist"
      aria-label="View mode"
    >
      {TABS.map(({ mode, label, countKey }) => {
        const active = viewMode === mode
        const count = countKey ? counts[countKey] : 0
        return (
          <button
            key={mode}
            role="tab"
            aria-selected={active}
            className={`relative flex items-center gap-1.5 px-4 py-2 text-sm transition-colors ${
              active
                ? 'font-medium text-text'
                : 'text-text-soft hover:bg-hover hover:text-text'
            }`}
            onClick={() =>
              onViewModeChange(active && mode !== 'normal' ? 'normal' : mode)
            }
          >
            {label}
            {count > 0 && (
              <span className="rounded-full bg-surface-strong px-1.5 py-0.5 text-[10px] leading-none text-text-soft">
                {count}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />
            )}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && bun vitest run src/components/__tests__/ViewModeTabs.test.tsx`
Expected: PASS

- [ ] **Step 5: Run format/lint and type check**

```bash
cd frontend && bun run check && bunx --bun tsgo
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ViewModeTabs.tsx frontend/src/components/__tests__/ViewModeTabs.test.tsx
git commit -m "feat: add ViewModeTabs component for main content view switching"
```

---

## Task 2: Move View Modes from Sidebar to Main Content

Remove the view mode buttons (Hidden, Favorites, People) and related props from the Sidebar. Add the ViewModeTabs strip to the top of the main content area in `index.tsx`, replacing the existing conditional view mode header. Move the Scan Faces button into the people mode sub-header.

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx` — Remove view mode buttons block (`{onViewModeChange && (...)}`) and Scan Faces block, trim props
- Modify: `frontend/src/routes/index.tsx` — Add ViewModeTabs, restructure view mode header, move Scan Faces button
- Modify: `frontend/src/components/__tests__/Sidebar.test.tsx` — Remove view mode button tests

### Steps

- [ ] **Step 1: Remove view mode button rendering from Sidebar**

In `frontend/src/components/Sidebar.tsx`, delete the entire view mode buttons block (the `{onViewModeChange && (...)}` section) and the Scan Faces button block (`{viewMode === 'people' && onStartFaceScan && (...)}`).

Also add `Suspense` to the react import (it's needed for the lazy-loaded `DateRangeFilter` which currently lacks a `Suspense` boundary — we'll add one in Task 3):

```tsx
import {
  lazy,
  Suspense,
  useCallback,
  // ...rest stays the same
} from 'react'
```

Remove these props from the `Props` interface and the function destructuring:
- `onViewModeChange`
- `hiddenCount`
- `favoritesCount`
- `faceScanning`
- `faceScanScanned`
- `faceScanTotal`
- `onStartFaceScan`

**Keep these props** — still needed:
- `viewMode` — conditionally shows filters in normal mode
- `personCount` — needed for faces filter visibility in Task 3

- [ ] **Step 2: Update Sidebar tests — remove view mode button assertions**

In `frontend/src/components/__tests__/Sidebar.test.tsx`, remove the test `'renders view mode buttons when onViewModeChange provided'` (lines 109-125). This test asserts on sidebar elements that no longer exist.

- [ ] **Step 3: Add ViewModeTabs to main content area in index.tsx**

In `frontend/src/routes/index.tsx`, add the import:

```tsx
import ViewModeTabs from '#/components/ViewModeTabs'
```

Replace the existing conditional view mode header (`{viewMode !== 'normal' && (...)}` block) with a permanent ViewModeTabs strip plus conditional sub-headers for mode-specific controls.

**Important:** The current close button at the end of the header has conditional behavior — when `personMerge.selectMode.active`, it exits select mode instead of going back to gallery. Preserve this logic in the people mode sub-header:

```tsx
<ViewModeTabs
  viewMode={viewMode}
  onViewModeChange={handleViewModeChange}
  hiddenCount={hiddenCount}
  favoritesCount={favoritesCount}
  personCount={faceScan.status.person_count}
/>
{viewMode === 'people' && !selectedPerson && (
  <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
    <span className="flex-1" />
    <button
      className="flex items-center justify-center gap-2 rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-hover disabled:opacity-50"
      onClick={() => faceScan.startScan(false)}
      disabled={faceScan.scanning}
    >
      {faceScan.scanning
        ? `Scanning... ${faceScan.status.scanned ?? 0}/${faceScan.status.total ?? 0}`
        : 'Scan Faces'}
    </button>
    <div className="flex items-center gap-1">
      <span className="text-xs text-text-soft">Similarity</span>
      <input
        type="number"
        min="0"
        max="1"
        step="0.05"
        value={similarityThreshold}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (v >= 0 && v <= 1) setSimilarityThreshold(v)
        }}
        className="w-14 rounded bg-surface-alt px-1.5 py-0.5 text-xs text-text outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
    {!personMerge.selectMode.active && (
      <button
        className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
        onClick={() => personMerge.selectMode.enterSelectMode()}
      >
        Select
      </button>
    )}
    <button
      className="rounded p-1 text-text-soft hover:bg-hover hover:text-text"
      onClick={() => {
        if (personMerge.selectMode.active) {
          personMerge.selectMode.exitSelectMode()
        } else {
          handleViewModeChange('normal')
        }
      }}
      title={
        personMerge.selectMode.active
          ? 'Exit select mode'
          : 'Back to gallery'
      }
      aria-label={
        personMerge.selectMode.active
          ? 'Exit select mode'
          : 'Back to gallery'
      }
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
)}
{viewMode === 'people' && selectedPerson && (
  <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
    <svg
      className="h-4 w-4 text-text-soft"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="8" cy="5" r="3" />
      <path d="M2 15c0-3 2.7-5 6-5s6 2 6 5" />
    </svg>
    <span className="flex-1 text-sm font-medium text-text">
      {selectedPerson.name}
    </span>
    <button
      className="rounded p-1 text-text-soft hover:bg-hover hover:text-text"
      onClick={() => setSelectedPersonId(undefined)}
      aria-label="Back to people"
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
)}
{viewMode !== 'normal' && viewMode !== 'people' && (
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
    <button
      className="rounded p-1 text-text-soft hover:bg-hover hover:text-text"
      onClick={() => handleViewModeChange('normal')}
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
)}
```

- [ ] **Step 4: Remove unused Sidebar props from index.tsx**

Remove these props from the `<Sidebar>` usage in `index.tsx`:
- `onViewModeChange={handleViewModeChange}`
- `hiddenCount={hiddenCount}`
- `favoritesCount={favoritesCount}`
- `faceScanning={faceScan.scanning}`
- `faceScanScanned={faceScan.status.scanned}`
- `faceScanTotal={faceScan.status.total}`
- `onStartFaceScan={() => faceScan.startScan(false)}`

**Keep these props on `<Sidebar>`:**
- `viewMode={viewMode}` — controls filter visibility
- `personCount={faceScan.status.person_count}` — controls faces filter visibility

- [ ] **Step 5: Run format/lint, type check, and tests**

```bash
cd frontend && bun run check && bunx --bun tsgo && bun vitest run
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/components/__tests__/Sidebar.test.tsx frontend/src/routes/index.tsx
git commit -m "refactor: move view mode controls from sidebar to main content tabs"
```

---

## Task 3: Collapsible Filters Disclosure Section

Group the three content filter blocks (date range, media type, faces) into a single collapsible "Filters" disclosure. This replaces three separate bordered sections with one disclosure that expands/collapses. Default state: collapsed (matching the date range default).

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx` — Replace the `{viewMode === 'normal' && (...)}` filter block
- Modify: `frontend/src/components/DateRangeFilter.tsx` — Change default collapsed state
- Modify: `frontend/src/components/__tests__/Sidebar.test.tsx` — Add disclosure test

### Steps

- [ ] **Step 1: Update existing filter tests and add disclosure test**

In `frontend/src/components/__tests__/Sidebar.test.tsx`:

First, update the existing test `'renders media type filter buttons in normal view mode'` — these filters are now behind a disclosure, so the test needs to expand it first. Also update `'calls onMediaTypeFilter when filter button clicked'` similarly.

Then add the new disclosure test:

```tsx
// UPDATE existing test — filters now require expanding the disclosure first:
it('renders media type filter buttons in normal view mode', () => {
  render(<Sidebar {...defaultProps} viewMode="normal" />)
  // Expand the Filters disclosure
  fireEvent.click(screen.getByRole('button', { name: /filters/i }))
  expect(screen.getByText('Photos')).toBeTruthy()
  expect(screen.getByText('Videos')).toBeTruthy()
})

// UPDATE existing test — same disclosure expansion needed:
it('calls onMediaTypeFilter when filter button clicked', () => {
  const onMediaTypeFilter = vi.fn()
  render(
    <Sidebar
      {...defaultProps}
      viewMode="normal"
      onMediaTypeFilter={onMediaTypeFilter}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /filters/i }))
  fireEvent.click(screen.getByText('Photos'))
  expect(onMediaTypeFilter).toHaveBeenCalledWith('photo')
})

// NEW test:
it('shows Filters disclosure that expands to reveal media type filters', () => {
  render(<Sidebar {...defaultProps} viewMode="normal" />)
  const disclosure = screen.getByRole('button', { name: /filters/i })
  expect(disclosure).toBeTruthy()
  // Filters are collapsed by default
  expect(screen.queryByText('Photos')).toBeNull()
  // Expand
  fireEvent.click(disclosure)
  expect(screen.getByText('Photos')).toBeTruthy()
  expect(screen.getByText('Videos')).toBeTruthy()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && bun vitest run src/components/__tests__/Sidebar.test.tsx`
Expected: FAIL — filters are currently always visible in normal mode, no disclosure button

- [ ] **Step 3: Replace the three filter blocks with a collapsible Filters section**

In `frontend/src/components/Sidebar.tsx`, replace the `{viewMode === 'normal' && (...)}` block (which renders DateRangeFilter, media type buttons, and faces filter buttons) with:

```tsx
{viewMode === 'normal' && (
  <FilterDisclosure
    dateRange={dateRange}
    onDateRangeChange={onDateRangeChange}
    mediaTypeFilter={mediaTypeFilter}
    onMediaTypeFilter={onMediaTypeFilter}
    facesFilter={facesFilter}
    onFacesFilter={onFacesFilter}
    personCount={personCount}
  />
)}
```

Add a `FilterDisclosure` component above `Sidebar` in the same file (or inline it). Add `personCount` back to the Props interface (it's needed for faces filter visibility, not for view mode buttons):

**Important:** The sidebar now uses `SegmentedControl` (from `./SegmentedControl`) for all filter button groups. The `FilterDisclosure` must also use it to maintain visual consistency.

```tsx
function FilterDisclosure({
  dateRange,
  onDateRangeChange,
  mediaTypeFilter,
  onMediaTypeFilter,
  facesFilter,
  onFacesFilter,
  personCount,
}: {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  mediaTypeFilter: string | null
  onMediaTypeFilter: (type: string | null) => void
  facesFilter?: string | null
  onFacesFilter?: (value: string | null) => void
  personCount: number
}) {
  const [expanded, setExpanded] = useState(false)

  const hasActiveFilters =
    mediaTypeFilter != null ||
    facesFilter != null ||
    dateRange != null

  return (
    <div className="border-t border-border">
      <button
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold text-text-soft hover:text-text"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label="Filters"
      >
        <svg
          className={`h-3 w-3 transition-transform ${expanded ? '' : '-rotate-90'}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
        Filters
        {hasActiveFilters && (
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        )}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-250 ease-in-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <Suspense>
            <DateRangeFilter
              dateRange={dateRange}
              onDateRangeChange={onDateRangeChange}
            />
          </Suspense>
          <div className="border-t border-border p-3">
            <SegmentedControl
              options={MEDIA_TYPE_OPTIONS}
              value={mediaTypeFilter}
              onChange={onMediaTypeFilter}
              label="Media type filter"
            />
          </div>
          {onFacesFilter && personCount > 0 && (
            <div className="border-t border-border p-3">
              <SegmentedControl
                options={FACES_FILTER_OPTIONS}
                value={facesFilter ?? null}
                onChange={onFacesFilter}
                label="Face count filter"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

Note: The `DateRangeFilter` already has its own internal collapsible state. Since it's now inside the Filters disclosure, update it to be always expanded when visible. Modify `DateRangeFilter.tsx` to remove its own collapse logic — change `useState(true)` to `useState(false)` so it starts expanded within the parent disclosure, or remove the collapse toggle entirely and always show the picker. The simplest approach: change the default state in `DateRangeFilter.tsx` line 15 from `useState(true)` to `useState(false)`.

- [ ] **Step 4: Update DateRangeFilter default state**

In `frontend/src/components/DateRangeFilter.tsx` line 15:

```tsx
// OLD:
const [collapsed, setCollapsed] = useState(true)
// NEW:
const [collapsed, setCollapsed] = useState(false)
```

This makes the date picker expand by default when the parent Filters disclosure is open. The DateRangeFilter keeps its own toggle for users who want to hide just the calendar.

- [ ] **Step 5: Verify `personCount` prop is wired through**

`personCount` was explicitly kept in Sidebar's Props interface during Task 2. Verify that:
- `personCount?: number` exists in the `Props` interface
- `personCount = 0` is in the function destructuring
- `personCount={faceScan.status.person_count}` is passed in `index.tsx`

No changes needed if Task 2 was done correctly.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd frontend && bun vitest run src/components/__tests__/Sidebar.test.tsx`
Expected: PASS

- [ ] **Step 7: Run format/lint, type check, and full tests**

```bash
cd frontend && bun run check && bunx --bun tsgo && bun vitest run
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/components/DateRangeFilter.tsx frontend/src/components/__tests__/Sidebar.test.tsx frontend/src/routes/index.tsx
git commit -m "refactor: group media filters into collapsible Filters disclosure"
```

---

## Task 4: Clear Button Danger Styling

Make the Clear button visually distinct from Sync using danger styling. The button already has a `window.confirm()` dialog (in `index.tsx`'s `handleClear` function), but it looks identical in weight to other buttons. Add red border and red text on hover to signal destructive intent.

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx` — Clear button class string

### Steps

- [ ] **Step 1: Write a test for danger styling**

In `frontend/src/components/__tests__/Sidebar.test.tsx`, add:

```tsx
it('renders Clear button with danger styling', () => {
  render(<Sidebar {...defaultProps} />)
  const clearBtn = screen.getByText('Clear').closest('button')!
  // Check for danger token classes (border-danger/40 and text-danger)
  expect(clearBtn.className).toMatch(/border-danger/)
  expect(clearBtn.className).toMatch(/text-danger/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && bun vitest run src/components/__tests__/Sidebar.test.tsx`
Expected: FAIL — current Clear button uses `border-border-soft` and `text-text`

- [ ] **Step 3: Update Clear button classes**

In `frontend/src/components/Sidebar.tsx`, find the Clear button (search for `onClick={onClear}`):

```tsx
// OLD:
className="rounded-md border border-border-soft px-3 py-2 text-sm text-text hover:bg-hover disabled:opacity-50"

// NEW:
className="rounded-md border border-danger/40 px-3 py-2 text-sm text-danger hover:border-danger hover:bg-danger/10 disabled:opacity-50"
```

The `border-danger/40` gives a subtle red border at rest. On hover, it intensifies to full `border-danger` with a faint red background. This makes the destructive nature clear without being alarming at rest.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && bun vitest run src/components/__tests__/Sidebar.test.tsx`
Expected: PASS

- [ ] **Step 5: Run format/lint and type check**

```bash
cd frontend && bun run check && bunx --bun tsgo
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/components/__tests__/Sidebar.test.tsx
git commit -m "fix: add danger styling to Clear button for destructive intent"
```

---

## Task 5: Final Integration Test and Cleanup

Verify all changes work together. Clean up any unused imports or dead code.

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx` — Remove any unused imports/props
- Modify: `frontend/src/routes/index.tsx` — Remove any unused imports

### Steps

- [ ] **Step 1: Check for unused imports in Sidebar.tsx**

After removing view mode buttons and Scan Faces, check if any imports are no longer used. The `Suspense` import is only needed if `DateRangeFilter` lazy import is used inside `FilterDisclosure`. If the `Suspense` import was at the component level and `DateRangeFilter` is now used inside `FilterDisclosure`, ensure `Suspense` wraps it properly.

Remove any unused imports flagged by the linter.

- [ ] **Step 2: Run full test suite**

```bash
cd frontend && bun vitest run
```

All tests must pass.

- [ ] **Step 3: Run format/lint and type check**

```bash
cd frontend && bun run check && bunx --bun tsgo
```

- [ ] **Step 4: Visual sanity check — verify sidebar height**

After removing ~90 lines of view mode buttons and consolidating filters, the sidebar should be noticeably less cluttered. The layout from top to bottom should now be:

```
┌─────────────────────────────────────┐
│ [Chats / Hidden Chats] ▾ [eye] {n} │
├─────────────────────────────────────┤
│ [All] [People] [Groups] [Channels]  │
│ [All] [Synced] [Unsynced]           │
│ 🔍 Search chats...                  │
├─────────────────────────────────────┤
│ ▼ Chat List (scrollable)            │
├─────────────────────────────────────┤
│ ▸ Filters  (●)                      │ ← collapsed by default, dot = active
│   [DateRangeFilter]                 │
│   [All] [Photos] [Videos]           │
│   [All] [No people] [Solo] [Group]  │
├─────────────────────────────────────┤
│ X,XXX items synced                  │
├─────────────────────────────────────┤
│ [Sync] [Clear ⚠] [⊞]              │
├─────────────────────────────────────┤
│ [🌙]                                │
└─────────────────────────────────────┘
```

And the main content area header:

```
[Gallery] [Hidden 5] [Favorites 10] [People 23]
```

- [ ] **Step 5: Commit if any cleanup was needed**

```bash
git add -u frontend/src/
git commit -m "chore: clean up unused imports after sidebar restructure"
```

---

## Parallelization Guide

| Phase | Tasks | Notes |
|---|---|---|
| Phase 1 | Task 1 | Creates new file, no conflicts possible. |
| Phase 2 | Task 2 | Depends on Task 1 (imports ViewModeTabs). Modifies Sidebar.tsx + index.tsx. |
| Phase 3 | Task 3 + Task 4 (parallel) | After Task 2. Task 3 modifies the filter section of Sidebar. Task 4 modifies the Clear button class. Different lines, safe to parallelize. |
| Phase 4 | Task 5 | Final verification after all changes. |
