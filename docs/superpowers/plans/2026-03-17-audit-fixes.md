# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 28 issues found in the UI audit — hardcoded colors, broken keyboard access, missing ARIA, unused font, lightbox touch targets, and UX inconsistencies.

**Architecture:** Six tasks with explicit dependency ordering. Tasks 1-3 are highest priority (broken theming, keyboard dead zones, ARIA gaps). Task 3 includes lightbox touch target fixes since both modify `Lightbox.tsx`. Task 4 is a one-liner. Tasks 5-6 are lower priority refinements. See Parallelization Guide at the bottom for safe concurrency.

**Tech Stack:** React 19, Tailwind CSS v4, TanStack Router/Start, Vitest + React Testing Library

**Stack conventions:**
- Package manager: `bun`
- Format/lint: `bun run check` (oxfmt + oxlint)
- Type check: `bunx --bun tsgo` (not tsc)
- Tests: `bun run test` or `bun vitest run <file>`
- Import alias: `#/*` for `./src/*`
- No `import React` — React 19 JSX transform handles it
- Design tokens defined in `frontend/src/styles.css` as CSS custom properties (`--th-*` -> `--color-*`)
- Theme tokens available as Tailwind classes: `text-text`, `text-text-soft`, `bg-surface`, `bg-surface-alt`, `bg-hover`, `border-border`, `bg-accent`, `text-accent`, etc.

---

## Task 1: Normalize Theme Tokens (7 issues)

Replace all hardcoded Tailwind color classes (`neutral-*`, `blue-*`, `sky-*`) with design system tokens. This fixes broken light mode in AuthFlow, GroupOverflowMenu, and DateHeader, and unifies accent color usage across all components.

**Files:**
- Modify: `frontend/src/components/AuthFlow.tsx`
- Modify: `frontend/src/components/GroupOverflowMenu.tsx`
- Modify: `frontend/src/components/DateHeader.tsx`
- Modify: `frontend/src/components/MediaCard.tsx`
- Modify: `frontend/src/components/MediaGrid.tsx`
- Modify: `frontend/src/components/PeopleGrid.tsx`
- Modify: `frontend/src/components/SelectionBar.tsx`
- Modify: `frontend/src/components/Lightbox.tsx`
- Modify: `frontend/src/components/DateRangeFilter.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

**Principle:** Every color must come from the theme token system. The only exceptions are colors on explicitly colored surfaces (e.g., `text-white` on `bg-accent` is acceptable because the accent background is already themed). For selection/interactive accent, use `accent`/`accent-hover` tokens — never raw `blue-*` or `sky-*`.

### Steps

- [ ] **Step 1: Fix AuthFlow hardcoded colors**

In `frontend/src/components/AuthFlow.tsx`, replace the two class strings:

```tsx
// OLD (line 68-71):
const inputCls =
  'w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-200 placeholder:text-neutral-500 focus:border-sky-500 focus:outline-none'
const btnCls =
  'w-full rounded-md bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-50'

// NEW:
const inputCls =
  'w-full rounded-md border border-border bg-input px-3 py-2 text-text placeholder:text-text-soft focus:border-accent focus:outline-none'
const btnCls =
  'w-full rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50'
```

Also fix the helper text color (lines 101, 124):
- `text-neutral-400` -> `text-text-soft`

- [ ] **Step 2: Fix GroupOverflowMenu hardcoded colors**

In `frontend/src/components/GroupOverflowMenu.tsx`:

Line 63 — menu trigger button:
```
// OLD:
"shrink-0 rounded p-1 text-neutral-500 opacity-0 hover:bg-neutral-700 hover:text-neutral-300 group-hover:opacity-100"
// NEW:
"shrink-0 rounded p-1 text-text-soft opacity-0 hover:bg-hover hover:text-text group-hover:opacity-100"
```

Line 82 — floating menu container:
```
// OLD:
"z-50 min-w-[180px] rounded-lg border border-neutral-700 bg-neutral-800 py-1 shadow-lg"
// NEW:
"z-50 min-w-[180px] rounded-lg border border-border bg-surface py-1 shadow-lg"
```

Line 86 — hide button:
```
// OLD:
"flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-amber-400 hover:bg-neutral-700"
// NEW:
"flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-warning hover:bg-hover"
```

Line 104 — divider:
```
// OLD:
"mx-2 my-1 border-t border-neutral-700"
// NEW:
"mx-2 my-1 border-t border-border"
```

Line 106 — unsync button:
```
// OLD:
"flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 hover:bg-neutral-700 disabled:opacity-50"
// NEW:
"flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger hover:bg-hover disabled:opacity-50"
```

- [ ] **Step 3: Fix DateHeader hardcoded color**

In `frontend/src/components/DateHeader.tsx` line 7:
```
// OLD:
"pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400"
// NEW:
"pb-1 text-xs font-semibold uppercase tracking-wide text-text-soft"
```

- [ ] **Step 4: Normalize accent colors — blue/sky -> accent token**

Replace hardcoded blue/sky interactive colors across components. Each replacement below:

**MediaCard.tsx** line 69:
- `ring-blue-500` -> `ring-accent`

**MediaCard.tsx** line 101:
- `border-blue-500 bg-blue-500` -> `border-accent bg-accent`

**MediaGrid.tsx** line 231-233 (date group checkbox):
- `border-blue-500 bg-blue-500 text-white` -> `border-accent bg-accent text-white`

**MediaGrid.tsx** line 289 (selection rectangle):
- `border-blue-400 bg-blue-400/15` -> `border-accent bg-accent/15`

**PeopleGrid.tsx** line 64 (person card ring):
- `ring-sky-500 bg-sky-500/5` -> `ring-accent bg-accent/5`

**PeopleGrid.tsx** line 105-106 (person checkbox):
- `border-sky-500 bg-sky-500` -> `border-accent bg-accent`

**PeopleGrid.tsx** line 259 (selection rectangle):
- `border-sky-500 bg-sky-500/10` -> `border-accent bg-accent/10`

**Sidebar.tsx** line 542-543 (select mode button):
- `border-blue-500 bg-blue-500/20 text-blue-300` -> `border-accent bg-accent/20 text-accent`

**Sidebar.tsx** line 366 (sync progress):
- `text-sky-400` -> `text-accent`

**SelectionBar.tsx** lines 149, 156 (select all / deselect links):
- `text-sky-400 hover:text-sky-300` -> `text-accent hover:text-accent-hover`

**SelectionBar.tsx** line 215 (download button):
- `bg-blue-600` -> `bg-accent`
- `hover:bg-blue-500` -> `hover:bg-accent-hover`

**Lightbox.tsx** lines 114, 183-185 (selected indicator + select button):
- `border-blue-500 bg-blue-500` -> `border-accent bg-accent`
- `border-blue-500 bg-blue-500/20 text-blue-300` -> `border-accent bg-accent/20 text-accent`

**DateRangeFilter.tsx** lines 37, 60 (clear link + today color):
- `text-sky-400 hover:text-sky-300` -> `text-accent hover:text-accent-hover`
- `'--rdp-today-color': '#38bdf8'` -> `'--rdp-today-color': 'var(--th-accent)'`

**MediaGrid.tsx** line 167 (sync progress bar):
- `bg-sky-600` -> `bg-accent`

**PeopleGrid.tsx** line 236 ("Select group" button):
- `text-sky-400 hover:text-sky-300` -> `text-accent hover:text-accent-hover`

**Sidebar.tsx** line 569 (resize handle):
- `hover:bg-sky-500/40 active:bg-sky-500/60` -> `hover:bg-accent/40 active:bg-accent/60`

**SelectionBar.tsx** line 164 (unhide button):
- `bg-emerald-600` -> `bg-success`
- `hover:bg-emerald-500` -> `hover:bg-success/80`

**SelectionBar.tsx** line 188 (favorite button):
- `bg-red-600/80` -> `bg-danger/80`
- `hover:bg-red-500` -> `hover:bg-danger`

**Lightbox.tsx** line 127 (favorited indicator):
- `bg-red-500/90` -> `bg-danger/90`

**Lightbox.tsx** line 216 (unhide button):
- `border-emerald-600` -> `border-success`
- `text-emerald-300` -> `text-success`
- `hover:bg-emerald-900/30` -> `hover:bg-success/10`

- [ ] **Step 5: Run format/lint and type check**

```bash
cd frontend && bun run check && bunx --bun tsgo
```

Fix any issues.

- [ ] **Step 6: Run existing tests**

```bash
cd frontend && bun vitest run
```

All existing tests should still pass (these are purely visual changes).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/AuthFlow.tsx frontend/src/components/GroupOverflowMenu.tsx frontend/src/components/DateHeader.tsx frontend/src/components/MediaCard.tsx frontend/src/components/MediaGrid.tsx frontend/src/components/PeopleGrid.tsx frontend/src/components/SelectionBar.tsx frontend/src/components/Lightbox.tsx frontend/src/components/DateRangeFilter.tsx frontend/src/components/Sidebar.tsx
git commit -m "fix: replace hardcoded colors with theme tokens across all components"
```

---

## Task 2: Fix Keyboard Accessibility — Interactive Elements (3 issues)

Replace `<div onClick>` with `<button>` for sidebar group items and hidden dialog items. Add `role="checkbox"` and `aria-checked` to custom selection checkboxes.

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/MediaCard.tsx`
- Modify: `frontend/src/components/MediaGrid.tsx`
- Modify: `frontend/src/components/PeopleGrid.tsx`

### Steps

- [ ] **Step 1: Convert sidebar group items from div to button**

In `frontend/src/components/Sidebar.tsx`, the group list (lines 343-388). The outer `<div>` with `onClick` needs to become a `<button>`. Change:

```tsx
// OLD (line 343):
<div
  key={g.id}
  className={`group mb-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${...}`}
  onClick={() => onToggleGroup(g)}
  title={g.active ? 'Click to deactivate' : 'Click to activate'}
>

// NEW:
<button
  key={g.id}
  type="button"
  className={`group mb-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left transition-colors ${...}`}
  onClick={() => onToggleGroup(g)}
  title={g.active ? 'Click to deactivate' : 'Click to activate'}
>
```

Change closing `</div>` to `</button>` (around line 388).

Note: Add `w-full` and `text-left` to preserve layout since buttons default to inline and centered text.

- [ ] **Step 2: Make hidden dialog unhide button always visible on focus**

In `frontend/src/components/Sidebar.tsx` line 325, the unhide button is `opacity-0 group-hover:opacity-100`. Add `focus:opacity-100` so keyboard users can discover it:

```
// OLD:
"shrink-0 rounded p-1 text-text-soft opacity-0 hover:bg-surface-strong hover:text-green-400 group-hover:opacity-100"
// NEW:
"shrink-0 rounded p-1 text-text-soft opacity-0 hover:bg-surface-strong hover:text-success focus:opacity-100 group-hover:opacity-100"
```

Also change `text-green-400` to `text-success` for token consistency.

- [ ] **Step 3: Add checkbox semantics to MediaCard selection indicator**

In `frontend/src/components/MediaCard.tsx` lines 98-118, the selection checkbox div:

```tsx
// OLD:
<div
  className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors${...}`}
>

// NEW:
<div
  role="checkbox"
  aria-checked={selected}
  aria-label="Select item"
  className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors${...}`}
>
```

- [ ] **Step 4: Add checkbox semantics to MediaGrid date group checkbox**

In `frontend/src/components/MediaGrid.tsx` lines 229-247:

```tsx
// OLD:
<div
  className={`flex h-4 w-4 items-center justify-center rounded border transition-colors${...}`}
>

// NEW:
<div
  role="checkbox"
  aria-checked={allSelected}
  aria-label="Select all items in this date group"
  className={`flex h-4 w-4 items-center justify-center rounded border transition-colors${...}`}
>
```

- [ ] **Step 5: Add checkbox semantics to PeopleGrid person checkbox**

In `frontend/src/components/PeopleGrid.tsx` lines 102-122:

```tsx
// OLD:
<div
  className={`absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 shadow-sm ${...}`}
>

// NEW:
<div
  role="checkbox"
  aria-checked={selectedIds?.has(person.id) ?? false}
  aria-label={`Select ${person.display_name}`}
  className={`absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 shadow-sm ${...}`}
>
```

- [ ] **Step 6: Run checks and tests**

```bash
cd frontend && bun run check && bunx --bun tsgo && bun vitest run
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/components/MediaCard.tsx frontend/src/components/MediaGrid.tsx frontend/src/components/PeopleGrid.tsx
git commit -m "fix: improve keyboard accessibility — use button elements and add checkbox roles"
```

---

## Task 3: Add ARIA Labels and Focus Indicators (4 issues)

Add `aria-label` to all icon-only buttons. Add `aria-hidden="true"` to decorative SVGs. Add filter group labeling. Establish a consistent `focus-visible` ring style.

**Files:**
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/components/ShortcutsModal.tsx`
- Modify: `frontend/src/components/PersonMergeModal.tsx`
- Modify: `frontend/src/components/KeepPersonPicker.tsx`
- Modify: `frontend/src/components/Lightbox.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/routes/index.tsx`

### Steps

- [ ] **Step 1: Add global focus-visible style**

In `frontend/src/styles.css`, after the existing `button, a` transition rule (line 155-162), add:

```css
:focus-visible {
  outline: 2px solid var(--th-ring);
  outline-offset: 2px;
}
```

This gives all focusable elements a consistent ring using the existing `--th-ring` token (sky-blue at 50% opacity).

- [ ] **Step 2: Add aria-label to modal close buttons**

**ShortcutsModal.tsx** line 65 — add `aria-label="Close"`:
```tsx
<button className="text-text-soft hover:text-text" onClick={onClose} aria-label="Close">
```

**PersonMergeModal.tsx** line 37 — same:
```tsx
<button className="text-text-soft hover:text-text" onClick={onClose} aria-label="Close">
```

**KeepPersonPicker.tsx** line 35 — same:
```tsx
<button className="text-text-soft hover:text-text" onClick={onClose} aria-label="Close">
```

**Lightbox.tsx** line 94 — add aria-label and increase hit target:
```tsx
// OLD:
<button
  className="absolute -top-8 right-0 text-xl text-white"
  onClick={onClose}
>
// NEW:
<button
  className="absolute -top-10 -right-2 p-2 text-xl text-white"
  onClick={onClose}
  aria-label="Close lightbox"
>
```

- [ ] **Step 3: Fix Lightbox nav buttons — aria-labels, touch targets, responsive positioning**

First, update `navBtnCls` (line 77-78) to ensure 44x44px minimum touch target:

```tsx
// OLD:
const navBtnCls =
  'absolute top-1/2 -translate-y-1/2 rounded bg-black/50 px-3 py-4 text-2xl text-white hover:bg-black/70'

// NEW:
const navBtnCls =
  'absolute top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-2xl text-white hover:bg-black/70'
```

Then update the nav button elements (lines 101, 106) to add aria-labels and responsive positioning (inside image on small screens, outside on sm+):

```tsx
// OLD:
<button className={`${navBtnCls} -left-14`} onClick={onPrev}>
// NEW:
<button className={`${navBtnCls} left-2 sm:-left-14`} onClick={onPrev} aria-label="Previous item">

// OLD:
<button className={`${navBtnCls} -right-14`} onClick={onNext}>
// NEW:
<button className={`${navBtnCls} right-2 sm:-right-14`} onClick={onNext} aria-label="Next item">
```

- [ ] **Step 4: Add aria-label to sidebar icon-only buttons**

**Sidebar.tsx** line 241 — hidden chats toggle button (already has `title`, add `aria-label`):
```tsx
// Add aria-label matching the title:
aria-label={showHiddenDialogs ? 'Show visible chats' : 'Show hidden chats'}
```

**Sidebar.tsx** line 539 — select mode button (already has `title`, add `aria-label`):
```tsx
aria-label="Select mode"
```

- [ ] **Step 5: Add aria-label to close/exit buttons in index.tsx**

In `frontend/src/routes/index.tsx` line 673 — the close/back button in the view mode header bar:
```tsx
// Add aria-label:
aria-label={personMerge.selectMode.active ? 'Exit select mode' : 'Back to gallery'}
```

Line 876 — the close button in the person merge selection bar:
```tsx
// Add to the button:
aria-label="Exit select mode"
```

- [ ] **Step 6: Add role="group" and aria-label to filter button rows**

**Sidebar.tsx** line 276 — chat type filter row:
```tsx
// OLD:
<div className="flex gap-1 border-b border-border p-2">
// NEW:
<div className="flex gap-1 border-b border-border p-2" role="group" aria-label="Chat type filter">
```

**Sidebar.tsx** line 287 — sync filter row:
```tsx
<div className="flex gap-1 border-b border-border p-2" role="group" aria-label="Sync status filter">
```

**Sidebar.tsx** line 480 — media type filter row:
```tsx
<div className="flex gap-1 border-t border-border p-3" role="group" aria-label="Media type filter">
```

**Sidebar.tsx** line 492 — faces filter row:
```tsx
<div className="flex gap-1 border-t border-border p-3" role="group" aria-label="Face count filter">
```

- [ ] **Step 7: Run checks and tests**

```bash
cd frontend && bun run check && bunx --bun tsgo && bun vitest run
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/styles.css frontend/src/components/ShortcutsModal.tsx frontend/src/components/PersonMergeModal.tsx frontend/src/components/KeepPersonPicker.tsx frontend/src/components/Lightbox.tsx frontend/src/components/Sidebar.tsx frontend/src/routes/index.tsx
git commit -m "fix: add ARIA labels, focus-visible indicators, and filter group semantics"
```

---

## Task 4: Remove Unused Fraunces Font (1 issue)

**Files:**
- Modify: `frontend/src/styles.css`

### Steps

- [ ] **Step 1: Remove Fraunces from Google Fonts import**

In `frontend/src/styles.css` line 1:

```css
/* OLD: */
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Manrope:wght@400;500;600;700;800&display=swap');

/* NEW: */
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
```

- [ ] **Step 2: Verify no references to Fraunces exist**

```bash
cd frontend && grep -r "Fraunces" src/
```

Expected: no output (no references).

- [ ] **Step 3: Run checks**

```bash
cd frontend && bun run check && bunx --bun tsgo
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles.css
git commit -m "perf: remove unused Fraunces font import"
```

---

## Task 5: Use Dynamic Viewport Height (1 issue)

Replace `h-screen` with `h-dvh` to handle mobile browser chrome correctly.

**Files:**
- Modify: `frontend/src/routes/index.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

### Steps

- [ ] **Step 1: Replace h-screen with h-dvh**

**index.tsx** line 546:
```tsx
// OLD:
<div className="flex h-screen">
// NEW:
<div className="flex h-dvh">
```

**Sidebar.tsx** line 221:
```tsx
// OLD:
<aside
  className="relative flex h-screen flex-col border-r border-border bg-surface"
// NEW:
<aside
  className="relative flex h-dvh flex-col border-r border-border bg-surface"
```

- [ ] **Step 2: Run checks and tests**

```bash
cd frontend && bun run check && bunx --bun tsgo && bun vitest run
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/index.tsx frontend/src/components/Sidebar.tsx
git commit -m "fix: use h-dvh instead of h-screen for mobile browser compatibility"
```

---

## Task 6: UX Consistency Fixes (3 issues)

Fix SelectionBar close button inconsistency, add Shift+click rename hint to People view, and improve empty state copy.

**Files:**
- Modify: `frontend/src/components/SelectionBar.tsx`
- Modify: `frontend/src/components/MediaGrid.tsx`
- Modify: `frontend/src/components/ShortcutsModal.tsx`

### Steps

- [ ] **Step 1: Replace text close button with SVG in SelectionBar**

In `frontend/src/components/SelectionBar.tsx` lines 247-252:

```tsx
// OLD:
<button
  className="text-sm text-text-soft hover:text-text"
  onClick={onCancel}
>
  ✕
</button>

// NEW:
<button
  className="rounded p-1 text-text-soft hover:text-text"
  onClick={onCancel}
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
```

- [ ] **Step 2: Improve empty state copy in MediaGrid**

In `frontend/src/components/MediaGrid.tsx` lines 177-181:

```tsx
// OLD:
<div className="flex flex-1 items-center justify-center p-8 text-text-soft">
  No media found. Select some groups and sync to get started.
</div>

// NEW:
<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-text-soft">
  <span className="text-sm">No media yet</span>
  <span className="text-xs">
    Pick chats from the sidebar, then hit Sync to pull in your media.
  </span>
</div>
```

- [ ] **Step 3: Add Shift+click rename hint to shortcuts modal**

In `frontend/src/components/ShortcutsModal.tsx`, add an entry to the General shortcuts group (after the existing entries, around line 20):

```tsx
{ key: 'Shift+Click', description: 'Rename person (People view)' },
```

- [ ] **Step 4: Run checks and tests**

```bash
cd frontend && bun run check && bunx --bun tsgo && bun vitest run
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SelectionBar.tsx frontend/src/components/MediaGrid.tsx frontend/src/components/ShortcutsModal.tsx
git commit -m "fix: improve UX consistency — close button, empty state, rename hint"
```

---

## Parallelization Guide

Tasks share files and **must respect ordering** to avoid merge conflicts.

**File overlap map:**
- `Sidebar.tsx`: Tasks 1, 2, 3
- `Lightbox.tsx`: Tasks 1, 3
- `MediaCard.tsx`: Tasks 1, 2
- `MediaGrid.tsx`: Tasks 1, 2, 6
- `PeopleGrid.tsx`: Tasks 1, 2
- `SelectionBar.tsx`: Tasks 1, 6
- `index.tsx`: Tasks 3, 5
- `styles.css`: Tasks 3, 4
- `ShortcutsModal.tsx`: Tasks 3, 6

**Recommended execution order (sequential with safe parallelism):**

| Phase | Tasks | Notes |
|---|---|---|
| Phase 1 | Task 4 | Quick win, no conflicts. Touches only `styles.css` import line. |
| Phase 2 | Task 1 | Highest impact — fixes broken light mode. Touches 10 files (colors only). |
| Phase 3 | Task 2 + Task 3 (parallel) | After Task 1 completes. Task 2 modifies element types in Sidebar/MediaCard/MediaGrid/PeopleGrid. Task 3 adds ARIA attrs + lightbox touch fixes in Lightbox/Sidebar/modals/index. Different lines in shared files. |
| Phase 4 | Task 5 + Task 6 (parallel) | After Phase 3. Task 5 = h-dvh in index+sidebar. Task 6 = SelectionBar/MediaGrid/ShortcutsModal. No line overlap. |
