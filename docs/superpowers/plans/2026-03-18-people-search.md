# People Tab Fuzzy Name Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fuzzy search input to the PeopleToolbar that filters the person grid by display name using Fuse.js.

**Architecture:** Search state lives in `index.tsx` (route component). PeopleToolbar gets a new search input and calls back on change. The route component filters `data.persons.persons` through Fuse.js before passing to PeopleGrid. When search is active, similar group sections are hidden and a flat filtered list is shown. PeopleGrid gets a new `emptyReason` prop to distinguish "no matches" from "no people found".

**Tech Stack:** Fuse.js (already installed), React, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-18-people-search-design.md`

---

### Task 1: Add search input to PeopleToolbar

**Files:**
- Modify: `frontend/src/components/PeopleToolbar.tsx`

- [ ] **Step 1: Add `searchQuery` and `onSearchChange` props**

Add two new props to the `Props` interface and destructure them:

```tsx
interface Props {
  // ... existing props ...
  searchQuery: string
  onSearchChange: (query: string) => void
}
```

- [ ] **Step 2: Add search input element**

Insert a search input before the `<span className="flex-1" />` spacer (after the Scan Faces button):

```tsx
<input
  type="text"
  placeholder="Search people..."
  value={searchQuery}
  onChange={(e) => onSearchChange(e.target.value)}
  className="rounded bg-surface-alt px-2.5 py-1 text-sm text-text placeholder:text-text-soft outline-none focus:ring-1 focus:ring-ring w-44"
/>
```

- [ ] **Step 3: Verify it renders**

Run: `bun run check` in the `frontend/` directory.
Expected: Lint/format pass (TypeScript will error in index.tsx because the new props aren't passed yet — that's expected at this stage).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PeopleToolbar.tsx
git commit -m "feat(people): add search input to PeopleToolbar"
```

---

### Task 2: Add "no matches" empty state to PeopleGrid

**Files:**
- Modify: `frontend/src/components/PeopleGrid.tsx`
- Modify: `frontend/src/components/__tests__/PeopleGrid.test.tsx`

- [ ] **Step 1: Write failing test for "no matches" state**

Add to `frontend/src/components/__tests__/PeopleGrid.test.tsx`:

```tsx
it('shows "No matches" when emptyReason is search', () => {
  render(
    <PeopleGrid
      persons={[]}
      loading={false}
      onPersonClick={vi.fn()}
      emptyReason="search"
    />,
  )
  expect(screen.getByText(/No matches/)).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run test -- --run PeopleGrid`
Expected: FAIL — `emptyReason` prop doesn't exist yet.

- [ ] **Step 3: Add `emptyReason` prop to PeopleGrid**

In `frontend/src/components/PeopleGrid.tsx`, add to the `Props` interface:

```tsx
interface Props {
  // ... existing props ...
  emptyReason?: 'search' | 'empty'
}
```

Destructure it in the component (default to `'empty'`):

```tsx
export default function PeopleGrid({
  // ... existing props ...
  emptyReason = 'empty',
}: Props) {
```

Update the empty state block (around line 216) to handle both reasons:

```tsx
if (persons.length === 0) {
  return (
    <p className="p-8 text-center text-text-soft">
      {emptyReason === 'search'
        ? 'No matches'
        : 'No people found. Run a face scan to detect faces in your photos.'}
    </p>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run test -- --run PeopleGrid`
Expected: All tests PASS (including the existing "renders empty state" test, which doesn't pass `emptyReason` so it defaults to `'empty'`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PeopleGrid.tsx frontend/src/components/__tests__/PeopleGrid.test.tsx
git commit -m "feat(people): add emptyReason prop to PeopleGrid for search state"
```

---

### Task 3: Wire up Fuse.js filtering in index.tsx

**Files:**
- Modify: `frontend/src/routes/index.tsx`

- [ ] **Step 1: Add search state and Fuse.js filtering**

Add `useState` and `useMemo` to the existing React import, and add a Fuse.js import in `frontend/src/routes/index.tsx`:

```tsx
import { lazy, Suspense, useRef, useCallback, useState, useMemo } from 'react'
import Fuse from 'fuse.js'
```

Inside `Home()`, after the existing state declarations (around line 53):

```tsx
const [peopleSearchQuery, setPeopleSearchQuery] = useState('')

const peopleFuse = useMemo(
  () =>
    new Fuse(data.persons.persons, {
      keys: ['display_name'],
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 1,
    }),
  [data.persons.persons],
)

const filteredPersons = useMemo(
  () =>
    !peopleSearchQuery.trim()
      ? data.persons.persons
      : peopleFuse.search(peopleSearchQuery).map((r) => r.item),
  [peopleFuse, peopleSearchQuery, data.persons.persons],
)
```

Note: The Fuse index is built once when `persons` changes, not on every keystroke. The search runs separately against the cached index.

- [ ] **Step 2: Pass search props to PeopleToolbar**

Update the `<PeopleToolbar>` JSX (around line 214) to include the new props:

```tsx
<PeopleToolbar
  // ... existing props ...
  searchQuery={peopleSearchQuery}
  onSearchChange={setPeopleSearchQuery}
/>
```

- [ ] **Step 3: Pass filtered persons and emptyReason to PeopleGrid**

Update the `<PeopleGrid>` JSX (around line 258). Change `persons` prop and add `emptyReason`. Also hide similar groups when search is active:

```tsx
<PeopleGrid
  persons={filteredPersons}
  loading={data.persons.loading}
  // ... all other existing props stay the same ...
  similarGroups={peopleSearchQuery.trim() ? [] : data.persons.similarGroups}
  emptyReason={peopleSearchQuery.trim() ? 'search' : 'empty'}
/>
```

Key changes:
- `persons={data.persons.persons}` → `persons={filteredPersons}`
- `similarGroups={data.persons.similarGroups}` → conditionally `[]` when searching
- Add `emptyReason` prop

- [ ] **Step 4: Clear search when leaving people view**

In the `handleViewModeChange` callback or where view mode changes, clear the search. The simplest approach: reset on PeopleToolbar's `onClose`:

Update the `onClose` handler for PeopleToolbar (around line 228):

```tsx
onClose={() => {
  if (data.personMerge.selectMode.active) {
    data.personMerge.selectMode.exitSelectMode()
  } else {
    setPeopleSearchQuery('')
    handlers.handleViewModeChange('normal')
  }
}}
```

- [ ] **Step 5: Run format/lint check**

Run: `cd frontend && bun run check`
Expected: PASS

- [ ] **Step 6: Manually verify**

Run: `cd frontend && bun run dev`
- Navigate to People tab
- Type a name in the search input → grid filters
- Clear input → all people show again
- Type a non-existent name → "No matches" message appears
- Similar group headers are hidden during search

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/index.tsx
git commit -m "feat(people): wire up fuzzy name search with Fuse.js"
```
