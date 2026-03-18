# Cmd+Click Person Selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow cmd+click on a person card to enter merge select mode and toggle that person's selection, with auto-exit when the last person is deselected.

**Architecture:** Add a `metaKey` branch to PersonCard's click handler that calls a new `onMetaClick` prop. The parent (index.tsx) wires this to enter merge select mode + toggle. Auto-exit is handled inline after toggle.

**Tech Stack:** React, TypeScript, existing `useSelectMode` / `usePersonMerge` hooks

---

### Task 1: Add metaKey handling to PersonCard click handler

**Files:**
- Modify: `frontend/src/components/PeopleGrid.tsx:67-81` (PersonCard onClick)
- Modify: `frontend/src/components/PeopleGrid.tsx:39-45` (PersonCard props)
- Modify: `frontend/src/components/PeopleGrid.tsx:12-30` (Props interface)

- [ ] **Step 1: Add `onMetaClick` prop to PersonCard**

In `PeopleGrid.tsx`, add `onMetaClick` to **both** type locations:
- PersonCard's inline type (line 39-45)
- PeopleGrid's `Props` interface (line 12-30)

```tsx
onMetaClick?: (id: number) => void
```

- [ ] **Step 2: Add metaKey branch to PersonCard onClick**

In the `onClick` handler (line 67-81), add a `metaKey` check right after the `editing` guard and before the `shiftKey` check:

```tsx
onClick={(e) => {
  if (editing) return
  if ((e.metaKey || e.ctrlKey) && onMetaClick) {
    e.preventDefault()
    onMetaClick(person.id)
    return
  }
  if (e.shiftKey && onRename) {
    e.preventDefault()
    setEditName(person.name ?? '')
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.focus())
    return
  }
  if (selectMode && onToggle) {
    onToggle(person.id)
  } else {
    onPersonClick(person)
  }
}}
```

Note: `e.ctrlKey` is included for non-Mac platforms.

- [ ] **Step 3: Pass `onMetaClick` through cardProps**

In the `cardProps` object (around line 215-221), add `onMetaClick` alongside the existing props. This requires adding `onMetaClick` to the `Props` interface first:

```tsx
// Props interface (line 12-30) — add:
onMetaClick?: (id: number) => void

// cardProps (around line 215) — add:
const cardProps = {
  selectMode,
  selectedIds,
  onToggle,
  onPersonClick,
  onRename,
  onMetaClick,
}
```

- [ ] **Step 4: Run lint/format check**

Run: `cd frontend && bun run check`
Expected: No errors related to the changes

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PeopleGrid.tsx
git commit -m "feat(people): add metaKey branch to PersonCard click handler"
```

---

### Task 2: Wire onMetaClick in index.tsx with auto-exit

**Files:**
- Modify: `frontend/src/routes/index.tsx:200-230` (PeopleGrid usage)

- [ ] **Step 1: Add onMetaClick handler to PeopleGrid in index.tsx**

In the `<PeopleGrid>` JSX (around line 202-230), add the `onMetaClick` prop:

In index.tsx, `data` comes from `const data = useHomeData()` (line 48). The `personMerge.selectMode` is the same selection state used by the toolbar "Select" button and drag-select, so cmd+click composes with both.

```tsx
onMetaClick={(id: number) => {
  const sm = data.personMerge.selectMode
  if (!sm.active) {
    sm.enterSelectMode(id)
  } else {
    // Read pre-toggle state before calling toggle
    const wasSelected = sm.selectedIds.has(id)
    const wasOnly = sm.selectedIds.size === 1
    sm.toggle(id)
    // Auto-exit: if the toggled person was the only selected one,
    // selection is now empty. selectedIds still reflects the
    // pre-toggle snapshot in this render cycle.
    if (wasSelected && wasOnly) {
      sm.exitSelectMode()
    }
  }
}}
```

- [ ] **Step 2: Run lint/format check**

Run: `cd frontend && bun run check`
Expected: No errors

- [ ] **Step 3: Manual smoke test**

1. Open `/?mode=people`
2. Cmd+click a person — should enter merge select mode with that person selected, merge bar visible
3. Cmd+click another person — should add to selection
4. Cmd+click a selected person — should deselect
5. Cmd+click the last selected person — should exit merge select mode, merge bar hidden
6. Verify regular click still navigates to person detail
7. Verify shift+click still triggers rename
8. Enter merge select mode via toolbar "Select" button, then cmd+click — should toggle normally
9. Drag-select some people, then cmd+click another — should add to selection

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/index.tsx
git commit -m "feat(people): wire cmd+click to enter merge select mode"
```
