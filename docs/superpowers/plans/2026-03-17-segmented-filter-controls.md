# Segmented Filter Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace loose filter buttons with a segmented control pattern so active/inactive state is instantly scannable across all 4 filter groups.

**Architecture:** Extract a reusable `SegmentedControl` component. Active segments use `bg-surface-strong text-text` (subtle background shift). Inactive segments use transparent background with `text-text-soft`. The accent color (`bg-accent`) is freed up for primary actions only (Sync, Download, Scan Faces). The container gets a single `bg-surface-alt rounded-lg` pill that groups options visually.

**Tech Stack:** React 19, Tailwind CSS v4, Vitest + React Testing Library

---

### File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/components/SegmentedControl.tsx` | Reusable segmented control component |
| Create | `frontend/src/components/__tests__/SegmentedControl.test.tsx` | Unit tests |
| Modify | `frontend/src/components/Sidebar.tsx:287-314,499-529` | Replace filter button markup with `<SegmentedControl>` |

---

### Task 1: Create SegmentedControl Component with Tests

**Files:**
- Create: `frontend/src/components/__tests__/SegmentedControl.test.tsx`
- Create: `frontend/src/components/SegmentedControl.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/__tests__/SegmentedControl.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from '#/components/SegmentedControl'

const options = [
  { label: 'All', value: null },
  { label: 'Photos', value: 'photo' },
  { label: 'Videos', value: 'video' },
]

describe('SegmentedControl', () => {
  it('renders all options', () => {
    render(
      <SegmentedControl
        options={options}
        value={null}
        onChange={() => {}}
        label="Media type filter"
      />,
    )
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Photos')).toBeInTheDocument()
    expect(screen.getByText('Videos')).toBeInTheDocument()
  })

  it('applies active styling to selected option', () => {
    render(
      <SegmentedControl
        options={options}
        value="photo"
        onChange={() => {}}
        label="Media type filter"
      />,
    )
    const active = screen.getByText('Photos')
    expect(active.className).toContain('bg-surface-strong')
    expect(active.className).toContain('text-text')
  })

  it('applies inactive styling to unselected options', () => {
    render(
      <SegmentedControl
        options={options}
        value="photo"
        onChange={() => {}}
        label="Media type filter"
      />,
    )
    const inactive = screen.getByText('All')
    expect(inactive.className).toContain('text-text-soft')
    expect(inactive.className).not.toContain('bg-surface-strong')
  })

  it('calls onChange when an option is clicked', async () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        options={options}
        value={null}
        onChange={onChange}
        label="Media type filter"
      />,
    )
    await userEvent.click(screen.getByText('Videos'))
    expect(onChange).toHaveBeenCalledWith('video')
  })

  it('has role=group and aria-label', () => {
    render(
      <SegmentedControl
        options={options}
        value={null}
        onChange={() => {}}
        label="Media type filter"
      />,
    )
    const group = screen.getByRole('group', { name: 'Media type filter' })
    expect(group).toBeInTheDocument()
  })

  it('marks active button with aria-pressed', () => {
    render(
      <SegmentedControl
        options={options}
        value="photo"
        onChange={() => {}}
        label="Media type filter"
      />,
    )
    expect(screen.getByText('Photos')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('All')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/SegmentedControl.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the SegmentedControl component**

```tsx
// frontend/src/components/SegmentedControl.tsx

type Option = {
  label: string
  value: string | null
}

type SegmentedControlProps = {
  options: Option[]
  value: string | null
  onChange: (value: string | null) => void
  label: string
}

export function SegmentedControl({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps) {
  return (
    <div
      className="flex gap-0.5 rounded-lg bg-surface-alt p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((opt) => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.label}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-surface-strong text-text shadow-sm'
                : 'text-text-soft hover:text-text'
            }`}
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/SegmentedControl.test.tsx`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SegmentedControl.tsx frontend/src/components/__tests__/SegmentedControl.test.tsx
git commit -m "feat: add SegmentedControl component with tests"
```

---

### Task 2: Replace Filter Buttons in Sidebar

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx:287-314` (chat type + sync filters)
- Modify: `frontend/src/components/Sidebar.tsx:499-529` (media type + faces filters)

- [ ] **Step 1: Add import for SegmentedControl**

At the top of `Sidebar.tsx`, add:
```tsx
import { SegmentedControl } from './SegmentedControl'
```

- [ ] **Step 2: Replace chat type filter buttons (lines 286-300)**

Replace the chat type filter `<div>` block:

```tsx
// Before (lines 286-300):
<div
  className="flex gap-1 border-b border-border p-2"
  role="group"
  aria-label="Chat type filter"
>
  {CHAT_TYPE_OPTIONS.map((opt) => (
    <button
      key={opt.label}
      className={`flex-1 rounded px-2 py-1 text-xs ${chatTypeFilter === opt.value ? 'bg-accent text-white' : 'border border-border text-text'}`}
      onClick={() => onChatTypeFilter(opt.value)}
    >
      {opt.label}
    </button>
  ))}
</div>
```

With:

```tsx
<div className="border-b border-border p-2">
  <SegmentedControl
    options={CHAT_TYPE_OPTIONS}
    value={chatTypeFilter}
    onChange={onChatTypeFilter}
    label="Chat type filter"
  />
</div>
```

- [ ] **Step 3: Replace sync status filter buttons (lines 301-315)**

Replace the sync filter `<div>` block:

```tsx
// Before (lines 301-315):
<div
  className="flex gap-1 border-b border-border p-2"
  role="group"
  aria-label="Sync status filter"
>
  {SYNC_FILTER_OPTIONS.map((opt) => (
    <button
      key={opt.label}
      className={`flex-1 rounded px-2 py-1 text-xs ${syncFilter === opt.value ? 'bg-accent text-white' : 'border border-border text-text'}`}
      onClick={() => onSyncFilter(opt.value)}
    >
      {opt.label}
    </button>
  ))}
</div>
```

With:

```tsx
<div className="border-b border-border p-2">
  <SegmentedControl
    options={SYNC_FILTER_OPTIONS}
    value={syncFilter}
    onChange={onSyncFilter}
    label="Sync status filter"
  />
</div>
```

- [ ] **Step 4: Replace media type filter buttons (lines 499-513)**

Replace the media type filter `<div>` block:

```tsx
// Before (lines 499-513):
<div
  className="flex gap-1 border-t border-border p-3"
  role="group"
  aria-label="Media type filter"
>
  {MEDIA_TYPE_OPTIONS.map((opt) => (
    <button
      key={opt.label}
      className={`flex-1 rounded px-2 py-1 text-xs ${mediaTypeFilter === opt.value ? 'bg-accent text-white' : 'border border-border text-text'}`}
      onClick={() => onMediaTypeFilter(opt.value)}
    >
      {opt.label}
    </button>
  ))}
</div>
```

With:

```tsx
<div className="border-t border-border p-3">
  <SegmentedControl
    options={MEDIA_TYPE_OPTIONS}
    value={mediaTypeFilter}
    onChange={onMediaTypeFilter}
    label="Media type filter"
  />
</div>
```

- [ ] **Step 5: Replace faces filter buttons (lines 514-529)**

Replace the faces filter `<div>` block:

```tsx
// Before (lines 514-529):
{onFacesFilter && (personCount ?? 0) > 0 && (
  <div
    className="flex gap-1 border-t border-border p-3"
    role="group"
    aria-label="Face count filter"
  >
    {FACES_FILTER_OPTIONS.map((opt) => (
      <button
        key={opt.label}
        className={`flex-1 rounded px-2 py-1 text-xs ${facesFilter === opt.value ? 'bg-accent text-white' : 'border border-border text-text'}`}
        onClick={() => onFacesFilter(opt.value)}
      >
        {opt.label}
      </button>
    ))}
  </div>
)}
```

With:

```tsx
{onFacesFilter && (personCount ?? 0) > 0 && (
  <div className="border-t border-border p-3">
    <SegmentedControl
      options={FACES_FILTER_OPTIONS}
      value={facesFilter}
      onChange={onFacesFilter}
      label="Face count filter"
    />
  </div>
)}
```

- [ ] **Step 6: Run lint and type check**

Run: `cd frontend && bun run check`
Expected: No errors

- [ ] **Step 7: Run all tests**

Run: `cd frontend && bun run vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "refactor: use SegmentedControl for filter groups

Replaces loose accent-colored filter buttons with a segmented control
pattern. Active segments use bg-surface-strong (subtle), reserving
bg-accent for primary actions (Sync, Download, Scan Faces)."
```
