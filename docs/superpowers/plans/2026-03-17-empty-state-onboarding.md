# Empty State Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the empty state from a passive "No media yet" message into a confident, directional onboarding moment that teaches new users the sidebar → sync flow.

**Architecture:** Extract the empty state into a dedicated component with a 3-step visual walkthrough. Uses numbered steps with subtle iconography — no illustrations, no animations, just clear visual hierarchy and purposeful typography. Stays true to "minimal, calm, refined" — this is a quiet guide, not a splash screen.

**Tech Stack:** React 19, Tailwind CSS v4 (theme tokens), inline SVG icons

**Stack conventions:**
- Package manager: `bun`
- Format/lint: `bun run check` (oxfmt + oxlint)
- Type check: `bunx --bun tsgo`
- Tests: `bun run test` or `bun vitest run <file>`
- Import alias: `#/*` for `./src/*`
- No `import React` — React 19 JSX transform handles it
- Design tokens: `text-text`, `text-text-soft`, `bg-surface`, `bg-surface-alt`, `bg-accent`, etc.

---

### Task 1: Create EmptyState Component

**Files:**
- Create: `frontend/src/components/EmptyState.tsx`
- Modify: `frontend/src/components/MediaGrid.tsx`

The empty state shows a 3-step guide: (1) Pick chats, (2) Hit Sync, (3) Browse your media. Each step gets a number, a short label, and a one-line description. The whole thing is centered in the grid area, vertically and horizontally.

Design decisions:
- **No illustrations or images** — stays consistent with the app's icon-driven, text-focused aesthetic
- **Numbered steps** — directional and scannable, gives the user a clear mental model
- **Muted palette** — uses `text-text-soft` and `text-text` only, with `bg-surface-alt` cards for the steps
- **Compact** — the entire empty state fits comfortably without scrolling
- **Accent on the key action** — step 2 (Sync) gets a subtle accent treatment since it's the primary CTA

- [ ] **Step 1: Create the EmptyState component**

```tsx
// frontend/src/components/EmptyState.tsx

export function EmptyState() {
  const steps = [
    {
      num: '1',
      label: 'Pick chats',
      desc: 'Open the sidebar and select the chats you want to pull media from.',
    },
    {
      num: '2',
      label: 'Sync',
      desc: 'Hit the Sync button to download your media.',
      accent: true,
    },
    {
      num: '3',
      label: 'Browse',
      desc: 'Your photos and videos will appear right here.',
    },
  ]

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-base font-semibold text-text">
          No media yet
        </h2>
        <p className="text-sm text-text-soft">
          Get started in three steps.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {steps.map((s) => (
          <div
            key={s.num}
            className="flex items-start gap-4 rounded-lg bg-surface-alt px-5 py-4"
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                s.accent
                  ? 'bg-accent text-white'
                  : 'bg-surface-strong text-text-soft'
              }`}
            >
              {s.num}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-text">
                {s.label}
              </span>
              <span className="text-xs text-text-soft">{s.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire EmptyState into MediaGrid**

In `frontend/src/components/MediaGrid.tsx`, add the import at the top (with the other component imports):

```tsx
import { EmptyState } from '#/components/EmptyState'
```

Replace lines 177-184 (the old empty state):

```tsx
// OLD:
return (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-text-soft">
    <span className="text-sm">No media yet</span>
    <span className="text-xs">
      Pick chats from the sidebar, then hit Sync to pull in your media.
    </span>
  </div>
)

// NEW:
return <EmptyState />
```

- [ ] **Step 3: Run format/lint and type check**

```bash
cd frontend && bun run check && bunx --bun tsgo
```

Fix any formatting issues.

- [ ] **Step 4: Run existing tests**

```bash
cd frontend && bun vitest run
```

All existing tests should still pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/EmptyState.tsx frontend/src/components/MediaGrid.tsx
git commit -m "feat: replace empty state with directional onboarding guide"
```

---

## Parallelization Guide

This is a single-task plan — no parallelization needed. The component is small and self-contained.
