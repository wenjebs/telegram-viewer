# Light Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add light/dark/system theme switching with a sidebar toggle, migrating from hardcoded Tailwind neutral classes to semantic theme tokens.

**Architecture:** Define semantic color tokens via Tailwind v4's `@theme` directive backed by CSS variables (`--th-*`). Theme values swap via `data-theme` attribute on `<html>`. A `ThemeToggle` component in the sidebar footer cycles between system/light/dark. Preference persists in localStorage with flash-prevention via inline script.

**Tech Stack:** Tailwind CSS v4, React 19, TanStack Start, Vitest + React Testing Library

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/styles.css` | Rewrite | `@theme` token definitions, light/dark/system CSS variable blocks, cleanup old vars |
| `src/hooks/useTheme.ts` | Create | Theme state hook — reads localStorage, cycles states, updates DOM |
| `src/components/ThemeToggle.tsx` | Create | Sun/moon/monitor icon button, uses `useTheme` |
| `src/routes/__root.tsx` | Modify | Inline theme script, body class migration, dynamic Toaster theme |
| `src/components/Sidebar.tsx` | Modify | Class migration + mount ThemeToggle in footer |
| `src/components/MediaGrid.tsx` | Modify | Class migration |
| `src/components/MediaCard.tsx` | Modify | Class migration |
| `src/components/Lightbox.tsx` | Modify | Class migration |
| `src/components/SelectionBar.tsx` | Modify | Class migration |
| `src/components/PeopleGrid.tsx` | Modify | Class migration |
| `src/components/PersonDetail.tsx` | Modify | Class migration |
| `src/components/PersonMergeModal.tsx` | Modify | Class migration |
| `src/components/KeepPersonPicker.tsx` | Modify | Class migration |
| `src/components/ShortcutsModal.tsx` | Modify | Class migration |
| `src/components/DateRangeFilter.tsx` | Modify | Class migration + theme-aware rdp vars |
| `src/routes/index.tsx` | Modify | Class migration (AuthFlow + bottom bar) |
| `src/hooks/__tests__/useTheme.test.ts` | Create | Tests for theme hook |
| `src/components/__tests__/ThemeToggle.test.tsx` | Create | Tests for toggle component |

---

## Class Migration Reference

Use this table for all component migration tasks. Each task references this table — do not repeat it.

| Old Class | New Class |
|-----------|-----------|
| `bg-neutral-950` | `bg-base` |
| `bg-neutral-900` | `bg-surface` |
| `bg-neutral-900/60`, `bg-neutral-900/80` | `bg-surface/60`, `bg-surface/80` |
| `bg-neutral-800` | `bg-surface-alt` |
| `hover:bg-neutral-800` | `hover:bg-hover` |
| `hover:bg-neutral-700` | `hover:bg-surface-strong` |
| `text-neutral-200` | `text-text` |
| `text-white` | `text-text` (unless on colored bg — keep `text-white`) |
| `text-neutral-300` | `text-text` |
| `text-neutral-400` | `text-text-soft` |
| `text-neutral-500` | `text-text-soft` |
| `text-neutral-600` | `text-text-soft` |
| `hover:text-neutral-200`, `hover:text-neutral-300` | `hover:text-text` |
| `border-neutral-700` | `border-border` |
| `border-neutral-800` | `border-border` |
| `border-neutral-600` | `border-border-soft` |
| `bg-sky-600` | `bg-accent` |
| `hover:bg-sky-500`, `hover:bg-sky-700` | `hover:bg-accent-hover` |
| `focus:ring-sky-500/50` | `focus:ring-ring` |
| `ring-offset-neutral-900` | `ring-offset-base` |
| `ring-neutral-700/50` | `ring-border` |
| `placeholder-neutral-500` | `placeholder-text-soft` |

**Keep unchanged** (these are semantic/accent colors that work in both themes):
- `bg-blue-500`, `bg-blue-600`, `border-blue-500`, `text-blue-300` (selection accent)
- `bg-red-500`, `bg-red-600`, `border-red-500`, `text-red-300` (danger)
- `bg-emerald-500`, `bg-emerald-600`, `border-emerald-600`, `text-emerald-300` (success)
- `bg-amber-600/20`, `text-amber-400` (warning/hidden)
- `bg-sky-500/5`, `bg-sky-500/10`, `border-sky-500`, `text-sky-300`, `text-sky-400` (active/highlight accents)
- `bg-black/40`, `bg-black/60`, `bg-black/70`, `bg-black/90` (overlays on media)
- `text-white` on colored backgrounds (buttons with `bg-accent`, `bg-blue-500`, etc.)
- `border-white/60`, `text-white/40`, `text-white/60` (overlay elements on dark media)

---

## Task 1: Theme Token System in CSS

**Files:**
- Modify: `frontend/src/styles.css`

This task replaces the entire `styles.css` with the new theme token system. No test needed — this is CSS-only and verified visually (app should look identical after this change since dark tokens match current colors).

- [ ] **Step 1: Rewrite styles.css**

Replace the full file with:

```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Manrope:wght@400;500;600;700;800&display=swap');

@theme {
  --font-sans: 'Manrope', ui-sans-serif, system-ui, sans-serif;

  --color-base: var(--th-base);
  --color-surface: var(--th-surface);
  --color-surface-alt: var(--th-surface-alt);
  --color-surface-strong: var(--th-surface-strong);
  --color-text: var(--th-text);
  --color-text-soft: var(--th-text-soft);
  --color-text-inv: var(--th-text-inv);
  --color-accent: var(--th-accent);
  --color-accent-hover: var(--th-accent-hover);
  --color-border: var(--th-border);
  --color-border-soft: var(--th-border-soft);
  --color-input: var(--th-input);
  --color-ring: var(--th-ring);
  --color-header: var(--th-header);
  --color-chip: var(--th-chip);
  --color-chip-border: var(--th-chip-border);
  --color-hover: var(--th-hover);
  --color-badge: var(--th-badge);
  --color-badge-text: var(--th-badge-text);
  --color-danger: var(--th-danger);
  --color-success: var(--th-success);
  --color-warning: var(--th-warning);
}

/* Dark theme (explicit) */
:root[data-theme='dark'] {
  --th-base: #0a1418;
  --th-surface: #171c1f;
  --th-surface-alt: #1e2528;
  --th-surface-strong: #252d31;
  --th-text: #e5e5e5;
  --th-text-soft: #a3a3a3;
  --th-text-inv: #171717;
  --th-accent: #0284c7;
  --th-accent-hover: #0369a1;
  --th-border: #404040;
  --th-border-soft: #525252;
  --th-input: #1e2528;
  --th-ring: rgba(14, 165, 233, 0.5);
  --th-header: rgba(10, 20, 24, 0.8);
  --th-chip: rgba(13, 28, 32, 0.9);
  --th-chip-border: rgba(141, 229, 219, 0.24);
  --th-hover: #292929;
  --th-badge: #10b981;
  --th-badge-text: #ffffff;
  --th-danger: #dc2626;
  --th-success: #10b981;
  --th-warning: #d97706;
}

/* Light theme (explicit) */
:root[data-theme='light'] {
  --th-base: #f0f5f4;
  --th-surface: #f8fafa;
  --th-surface-alt: #eef3f2;
  --th-surface-strong: #e4edeb;
  --th-text: #1a3d36;
  --th-text-soft: #5a7d75;
  --th-text-inv: #e5e5e5;
  --th-accent: #0284c7;
  --th-accent-hover: #0369a1;
  --th-border: #d0ddd9;
  --th-border-soft: #bfceca;
  --th-input: #ffffff;
  --th-ring: rgba(14, 165, 233, 0.5);
  --th-header: rgba(240, 245, 244, 0.85);
  --th-chip: rgba(224, 237, 234, 0.9);
  --th-chip-border: rgba(42, 110, 99, 0.2);
  --th-hover: #e4edeb;
  --th-badge: #10b981;
  --th-badge-text: #ffffff;
  --th-danger: #dc2626;
  --th-success: #10b981;
  --th-warning: #d97706;
}

/* System preference: dark (no data-theme attribute) */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --th-base: #0a1418;
    --th-surface: #171c1f;
    --th-surface-alt: #1e2528;
    --th-surface-strong: #252d31;
    --th-text: #e5e5e5;
    --th-text-soft: #a3a3a3;
    --th-text-inv: #171717;
    --th-accent: #0284c7;
    --th-accent-hover: #0369a1;
    --th-border: #404040;
    --th-border-soft: #525252;
    --th-input: #1e2528;
    --th-ring: rgba(14, 165, 233, 0.5);
    --th-header: rgba(10, 20, 24, 0.8);
    --th-chip: rgba(13, 28, 32, 0.9);
    --th-chip-border: rgba(141, 229, 219, 0.24);
    --th-hover: #292929;
    --th-badge: #10b981;
    --th-badge-text: #ffffff;
    --th-danger: #dc2626;
    --th-success: #10b981;
    --th-warning: #d97706;
  }
}

/* System preference: light (no data-theme attribute) */
@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    --th-base: #f0f5f4;
    --th-surface: #f8fafa;
    --th-surface-alt: #eef3f2;
    --th-surface-strong: #e4edeb;
    --th-text: #1a3d36;
    --th-text-soft: #5a7d75;
    --th-text-inv: #e5e5e5;
    --th-accent: #0284c7;
    --th-accent-hover: #0369a1;
    --th-border: #d0ddd9;
    --th-border-soft: #bfceca;
    --th-input: #ffffff;
    --th-ring: rgba(14, 165, 233, 0.5);
    --th-header: rgba(240, 245, 244, 0.85);
    --th-chip: rgba(224, 237, 234, 0.9);
    --th-chip-border: rgba(42, 110, 99, 0.2);
    --th-hover: #e4edeb;
    --th-badge: #10b981;
    --th-badge-text: #ffffff;
    --th-danger: #dc2626;
    --th-success: #10b981;
    --th-warning: #d97706;
  }
}
```

- [ ] **Step 2: Verify the app builds**

Run: `cd frontend && bun run build`
Expected: Build succeeds with no errors. The new `@theme` tokens generate Tailwind utility classes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.css
git commit -m "feat: add theme token system with light/dark/system CSS variables"
```

---

## Task 2: useTheme Hook

**Files:**
- Create: `frontend/src/hooks/useTheme.ts`
- Create: `frontend/src/hooks/__tests__/useTheme.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/hooks/__tests__/useTheme.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useTheme } from '#/hooks/useTheme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('useTheme', () => {
  it('defaults to system when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('system')
  })

  it('reads initial theme from localStorage', () => {
    localStorage.setItem('theme', 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })

  it('cycles system → light → dark → system', () => {
    const { result } = renderHook(() => useTheme())

    act(() => result.current.cycle())
    expect(result.current.theme).toBe('light')

    act(() => result.current.cycle())
    expect(result.current.theme).toBe('dark')

    act(() => result.current.cycle())
    expect(result.current.theme).toBe('system')
  })

  it('sets data-theme attribute for light and dark', () => {
    const { result } = renderHook(() => useTheme())

    act(() => result.current.cycle()) // → light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    act(() => result.current.cycle()) // → dark
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('removes data-theme attribute for system', () => {
    localStorage.setItem('theme', 'dark')
    const { result } = renderHook(() => useTheme())

    act(() => result.current.cycle()) // dark → system
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('persists choice to localStorage', () => {
    const { result } = renderHook(() => useTheme())

    act(() => result.current.cycle()) // → light
    expect(localStorage.getItem('theme')).toBe('light')

    act(() => result.current.cycle()) // → dark
    expect(localStorage.getItem('theme')).toBe('dark')

    act(() => result.current.cycle()) // → system
    expect(localStorage.getItem('theme')).toBe('system')
  })

  it('ignores invalid localStorage values', () => {
    localStorage.setItem('theme', 'banana')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('system')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/hooks/__tests__/useTheme.test.ts`
Expected: FAIL — module `#/hooks/useTheme` not found

- [ ] **Step 3: Implement useTheme hook**

Create `frontend/src/hooks/useTheme.ts`:

```ts
import { useState, useCallback } from 'react'

type Theme = 'system' | 'light' | 'dark'

const CYCLE: Theme[] = ['system', 'light', 'dark']

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark' || stored === 'system')
    return stored
  return 'system'
}

function applyTheme(theme: Theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme)
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  localStorage.setItem('theme', theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  const cycle = useCallback(() => {
    setTheme((current) => {
      const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]
      applyTheme(next)
      return next
    })
  }, [])

  return { theme, cycle }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/hooks/__tests__/useTheme.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTheme.ts frontend/src/hooks/__tests__/useTheme.test.ts
git commit -m "feat: add useTheme hook with system/light/dark cycling"
```

---

## Task 3: ThemeToggle Component

**Files:**
- Create: `frontend/src/components/ThemeToggle.tsx`
- Create: `frontend/src/components/__tests__/ThemeToggle.test.tsx`

**Depends on:** Task 2

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/__tests__/ThemeToggle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { ThemeToggle } from '#/components/ThemeToggle'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeToggle', () => {
  it('renders system icon by default', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: /system/i })).toBeDefined()
  })

  it('cycles through themes on click', async () => {
    render(<ThemeToggle />)
    const btn = screen.getByRole('button')

    await userEvent.click(btn) // → light
    expect(btn.getAttribute('aria-label')).toMatch(/light/i)

    await userEvent.click(btn) // → dark
    expect(btn.getAttribute('aria-label')).toMatch(/dark/i)

    await userEvent.click(btn) // → system
    expect(btn.getAttribute('aria-label')).toMatch(/system/i)
  })

  it('shows correct icon for each theme', async () => {
    render(<ThemeToggle />)
    const btn = screen.getByRole('button')

    // system — monitor icon
    expect(btn.querySelector('svg')).toBeDefined()

    await userEvent.click(btn) // → light — sun icon
    expect(btn.getAttribute('aria-label')).toMatch(/light/i)

    await userEvent.click(btn) // → dark — moon icon
    expect(btn.getAttribute('aria-label')).toMatch(/dark/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/ThemeToggle.test.tsx`
Expected: FAIL — module `#/components/ThemeToggle` not found

- [ ] **Step 3: Implement ThemeToggle component**

Create `frontend/src/components/ThemeToggle.tsx`:

```tsx
import { useTheme } from '#/hooks/useTheme'

const SunIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
    <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zm0 13a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zm8-5a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zm11.95-4.95a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 01-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zm-12.73 8.84a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 01-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zm12.73 0a.75.75 0 01-1.06 1.06l-1.06-1.06a.75.75 0 011.06-1.06l1.06 1.06zm-12.73-8.84a.75.75 0 01-1.06 0L4.1 4.1a.75.75 0 011.06-1.06l1.06 1.06a.75.75 0 010 1.06zM10 7a3 3 0 100 6 3 3 0 000-6z" />
  </svg>
)

const MoonIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
    <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.23 1.694a.75.75 0 01.226.31z" clipRule="evenodd" />
  </svg>
)

const MonitorIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
    <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v8.5A2.25 2.25 0 0115.75 15h-3.105a3.501 3.501 0 001.1 1.677A.75.75 0 0113.26 18H6.74a.75.75 0 01-.484-1.323A3.501 3.501 0 007.355 15H4.25A2.25 2.25 0 012 12.75v-8.5zm1.5 0a.75.75 0 01.75-.75h11.5a.75.75 0 01.75.75v7.5H3.5v-7.5z" clipRule="evenodd" />
  </svg>
)

const icons = { system: MonitorIcon, light: SunIcon, dark: MoonIcon }
const labels = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
}

export function ThemeToggle() {
  const { theme, cycle } = useTheme()
  const Icon = icons[theme]

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={labels[theme]}
      className="rounded-md p-1.5 text-text-soft transition-colors hover:bg-hover hover:text-text"
    >
      <Icon />
    </button>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/ThemeToggle.test.tsx`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ThemeToggle.tsx frontend/src/components/__tests__/ThemeToggle.test.tsx
git commit -m "feat: add ThemeToggle component with sun/moon/monitor icons"
```

---

## Task 4: Root Layout — Inline Script, Body Classes, Toaster

**Files:**
- Modify: `frontend/src/routes/__root.tsx`

**Depends on:** Task 1

- [ ] **Step 1: Add inline theme script to head**

In `RootDocument`, add the theme-init script after `<HeadContent />`. This is a hardcoded string literal with no user input — safe to use with innerHTML. The script reads localStorage and sets `data-theme` before React hydrates to prevent flash:

```tsx
<head>
  <HeadContent />
  <script
    dangerouslySetInnerHTML={{
      __html:
        '(function(){var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);else document.documentElement.removeAttribute("data-theme")})()',
    }}
  />
</head>
```

- [ ] **Step 2: Migrate body classes**

Change `<body>` from:
```tsx
<body className="bg-neutral-950 text-neutral-200 font-sans antialiased">
```
to:
```tsx
<body className="bg-base text-text font-sans antialiased">
```

- [ ] **Step 3: Make Toaster theme dynamic**

Import `useTheme` and update the Toaster in `RootComponent`:

```tsx
import { useTheme } from '#/hooks/useTheme'

function RootComponent() {
  const { theme } = useTheme()
  const toasterTheme = theme === 'system' ? 'system' : theme

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster theme={toasterTheme} position="bottom-right" richColors />
    </QueryClientProvider>
  )
}
```

- [ ] **Step 4: Migrate NotFound classes**

Change `text-neutral-400` to `text-text-soft` and `text-blue-400` to `text-accent` in the NotFound component.

- [ ] **Step 5: Verify build**

Run: `cd frontend && bun run build`
Expected: Build succeeds

- [ ] **Step 6: Run existing tests**

Run: `cd frontend && bun run vitest run`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/__root.tsx
git commit -m "feat: add theme init script, migrate root layout to theme tokens"
```

---

## Task 5: Migrate Sidebar + Mount ThemeToggle

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

**Depends on:** Tasks 1, 3

Apply class migration per the reference table. Key changes:

- [ ] **Step 1: Add ThemeToggle import and mount in sidebar footer**

Add `import { ThemeToggle } from '#/components/ThemeToggle'` at top.

Find the bottom of the sidebar (after the last button group, before the resize handle) and add:

```tsx
<div className="flex items-center justify-center border-t border-border py-2">
  <ThemeToggle />
</div>
```

- [ ] **Step 2: Migrate all color classes in Sidebar.tsx**

Apply the class migration reference table. Key replacements:
- `bg-neutral-900` → `bg-surface`
- `border-neutral-800` → `border-border`
- `bg-neutral-800` → `bg-surface-alt` (static) or `hover:bg-hover` (hover states)
- `text-neutral-500` → `text-text-soft`
- `text-neutral-300` → `text-text`
- `text-neutral-400` → `text-text-soft`
- `text-neutral-200` → `text-text`
- `text-white` → `text-text` (except on colored button backgrounds — keep `text-white`)
- `placeholder-neutral-500` → `placeholder-text-soft`
- `border-neutral-700` → `border-border`
- `border-neutral-600` → `border-border-soft`
- `bg-neutral-700` → `bg-surface-strong`

Leave `bg-sky-*`, `text-sky-*`, `border-sky-*`, `bg-amber-*`, `text-amber-*`, `bg-emerald-*`, `border-blue-*`, `text-blue-*` unchanged — these are accent colors.

- [ ] **Step 3: Run existing Sidebar tests**

Run: `cd frontend && bun run vitest run src/components/__tests__/Sidebar.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: migrate Sidebar to theme tokens, add ThemeToggle"
```

---

## Task 6: Migrate MediaCard + MediaGrid

**Files:**
- Modify: `frontend/src/components/MediaCard.tsx`
- Modify: `frontend/src/components/MediaGrid.tsx`

**Depends on:** Task 1

- [ ] **Step 1: Migrate MediaCard.tsx**

Apply migration table:
- `bg-neutral-800` → `bg-surface-alt`
- `ring-offset-neutral-900` → `ring-offset-base`
- `text-neutral-300` → `text-text` (in the overlay — but this is on `bg-black/60`, so keep light text: leave as-is or use `text-white/80`)

Note: MediaCard overlays sit on top of images with `bg-black/60`. Text in overlays should remain light (`text-white/80` or similar) regardless of theme.

- [ ] **Step 2: Migrate MediaGrid.tsx**

Apply migration table:
- `text-neutral-400` → `text-text-soft`
- `text-neutral-500` → `text-text-soft`
- `bg-neutral-900/60` → `bg-surface/60`
- `border-neutral-800` → `border-border`
- `border-neutral-700` → `border-border`
- `text-neutral-300` → `text-text`
- `hover:bg-neutral-800` → `hover:bg-hover`
- `border-neutral-500` → `border-border-soft`

Leave `border-blue-*`, `bg-blue-*`, `text-white` (on blue bg) unchanged.

- [ ] **Step 3: Run existing tests**

Run: `cd frontend && bun run vitest run src/components/__tests__/MediaCard.test.tsx src/components/__tests__/MediaGrid.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MediaCard.tsx frontend/src/components/MediaGrid.tsx
git commit -m "feat: migrate MediaCard and MediaGrid to theme tokens"
```

---

## Task 7: Migrate Lightbox + SelectionBar

**Files:**
- Modify: `frontend/src/components/Lightbox.tsx`
- Modify: `frontend/src/components/SelectionBar.tsx`

**Depends on:** Task 1

- [ ] **Step 1: Migrate Lightbox.tsx**

Apply migration table:
- `bg-neutral-800` → `bg-surface-alt`
- `text-neutral-200` → `text-text`
- `border-neutral-600` → `border-border-soft`
- `text-white` → `text-text` (except `text-white` on colored buttons — keep)
- `hover:bg-neutral-800` → `hover:bg-hover`
- `text-neutral-400` → `text-text-soft`

Leave `border-blue-*`, `bg-blue-*`, `text-blue-*`, `border-red-*`, `bg-red-*`, `text-red-*`, `border-emerald-*`, `text-emerald-*` unchanged.

Note: The Lightbox backdrop (`bg-black/90`) and overlay buttons should keep white/light text since they sit on a dark overlay regardless of theme.

- [ ] **Step 2: Migrate SelectionBar.tsx**

Apply migration table:
- `bg-neutral-900/95` → `bg-surface/95`
- `border-neutral-700` → `border-border`
- `text-neutral-300` → `text-text`
- `bg-neutral-700` → `bg-surface-strong`
- `bg-neutral-600` → `bg-surface-strong`
- `hover:bg-neutral-500` → `hover:bg-surface-alt`
- `hover:bg-neutral-600` → `hover:bg-surface-strong`
- `text-neutral-400` → `text-text-soft`
- `hover:text-neutral-200` → `hover:text-text`

Leave `text-sky-*`, `bg-emerald-*`, `bg-red-*`, `bg-blue-*`, `text-white` (on colored buttons), `text-white/40` unchanged.

- [ ] **Step 3: Run existing tests**

Run: `cd frontend && bun run vitest run src/components/__tests__/Lightbox.test.tsx src/components/__tests__/SelectionBar.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Lightbox.tsx frontend/src/components/SelectionBar.tsx
git commit -m "feat: migrate Lightbox and SelectionBar to theme tokens"
```

---

## Task 8: Migrate PeopleGrid + PersonDetail

**Files:**
- Modify: `frontend/src/components/PeopleGrid.tsx`
- Modify: `frontend/src/components/PersonDetail.tsx`

**Depends on:** Task 1

- [ ] **Step 1: Migrate PeopleGrid.tsx**

Apply migration table:
- `hover:bg-neutral-800/60` → `hover:bg-hover/60`
- `bg-neutral-800` → `bg-surface-alt`
- `ring-neutral-700/50` → `ring-border`
- `text-neutral-600` → `text-text-soft`
- `border-neutral-500` → `border-border-soft`
- `bg-neutral-900/80` → `bg-surface/80`
- `text-neutral-200` → `text-text`
- `text-neutral-500` → `text-text-soft`

Leave `ring-sky-*`, `border-sky-*`, `bg-sky-*`, `text-sky-*` unchanged.

- [ ] **Step 2: Migrate PersonDetail.tsx**

Apply migration table:
- `border-neutral-800` → `border-border`
- `text-neutral-400` → `text-text-soft`
- `hover:text-white` → `hover:text-text`
- `bg-neutral-800` → `bg-surface-alt`
- `text-neutral-500` → `text-text-soft`
- `text-white` → `text-text`
- `ring-neutral-600` → `ring-border-soft`
- `hover:bg-neutral-800` → `hover:bg-hover`

Leave `focus:sky-500`, `hover:text-sky-400` unchanged.

- [ ] **Step 3: Run existing tests**

Run: `cd frontend && bun run vitest run src/components/__tests__/PeopleGrid.test.tsx src/components/__tests__/PersonDetail.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PeopleGrid.tsx frontend/src/components/PersonDetail.tsx
git commit -m "feat: migrate PeopleGrid and PersonDetail to theme tokens"
```

---

## Task 9: Migrate Modals (PersonMergeModal, KeepPersonPicker, ShortcutsModal)

**Files:**
- Modify: `frontend/src/components/PersonMergeModal.tsx`
- Modify: `frontend/src/components/KeepPersonPicker.tsx`
- Modify: `frontend/src/components/ShortcutsModal.tsx`

**Depends on:** Task 1

- [ ] **Step 1: Migrate PersonMergeModal.tsx**

Apply migration table:
- `bg-neutral-900` → `bg-surface`
- `text-white` → `text-text`
- `text-neutral-400` → `text-text-soft`
- `hover:text-white` → `hover:text-text`
- `text-neutral-500` → `text-text-soft`
- `hover:bg-neutral-800` → `hover:bg-hover`
- `bg-neutral-800` → `bg-surface-alt`
- `text-neutral-300` → `text-text`

- [ ] **Step 2: Migrate KeepPersonPicker.tsx**

Same pattern as PersonMergeModal — apply identical replacements.

- [ ] **Step 3: Migrate ShortcutsModal.tsx**

Apply migration table:
- `bg-neutral-900` → `bg-surface`
- `text-white` → `text-text`
- `text-neutral-400` → `text-text-soft`
- `hover:text-white` → `hover:text-text`
- `text-neutral-500` → `text-text-soft`
- `text-neutral-300` → `text-text`
- `bg-neutral-800` → `bg-surface-alt`

- [ ] **Step 4: Run existing tests**

Run: `cd frontend && bun run vitest run src/components/__tests__/PersonMergeModal.test.tsx src/components/__tests__/ShortcutsModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PersonMergeModal.tsx frontend/src/components/KeepPersonPicker.tsx frontend/src/components/ShortcutsModal.tsx
git commit -m "feat: migrate modals to theme tokens"
```

---

## Task 10: Migrate DateRangeFilter + index.tsx (AuthFlow)

**Files:**
- Modify: `frontend/src/components/DateRangeFilter.tsx`
- Modify: `frontend/src/routes/index.tsx`

**Depends on:** Task 1

- [ ] **Step 1: Migrate DateRangeFilter.tsx**

Apply migration table for Tailwind classes:
- `border-neutral-800` → `border-border`
- `text-neutral-400` → `text-text-soft`
- `hover:text-neutral-300` → `hover:text-text`

For the react-day-picker inline styles, make them theme-aware using CSS variables:
- `'--rdp-accent-color': '#0ea5e9'` → `'--rdp-accent-color': 'var(--th-accent)'`
- `'--rdp-accent-background-color': '#0c4a6e'` → `'--rdp-accent-background-color': 'var(--color-surface-alt, #0c4a6e)'`
- `'--rdp-range_middle-background-color': '#172554'` → `'--rdp-range_middle-background-color': 'var(--color-surface-strong, #172554)'`
- `'--rdp-range_middle-color': '#bae6fd'` → `'--rdp-range_middle-color': 'var(--color-text, #bae6fd)'`
- `'--rdp-today-color': '#38bdf8'` → keep as-is (accent highlight)
- `color: '#d4d4d4'` → `color: 'var(--color-text-soft, #d4d4d4)'`

Leave `text-sky-400`, `hover:text-sky-300` unchanged.

- [ ] **Step 2: Migrate index.tsx**

This is a large file (~977 lines). Apply migration table for these areas:

**AuthFlow section (~lines 620-760):**
- `border-neutral-800` → `border-border`
- `bg-neutral-900` → `bg-surface`
- `bg-neutral-900/80` → `bg-surface/80`
- `text-neutral-400` → `text-text-soft`
- `text-neutral-500` → `text-text-soft`
- `text-white` → `text-text`
- `bg-neutral-800` → `bg-surface-alt`
- `text-neutral-300` → `text-text`
- `hover:bg-neutral-800` → `hover:bg-hover`
- `hover:text-neutral-200` → `hover:text-text`
- `hover:text-neutral-300` → `hover:text-text`

**Bottom bar section (~lines 890-920):**
- `border-neutral-700` → `border-border`
- `bg-neutral-900` → `bg-surface`
- `text-neutral-300` → `text-text`
- `text-neutral-400` → `text-text-soft`
- `hover:bg-neutral-800` → `hover:bg-hover`
- `hover:text-neutral-200` → `hover:text-text`

Leave all `bg-sky-*`, `text-sky-*`, `bg-emerald-*`, `text-emerald-*` unchanged.

- [ ] **Step 3: Run existing tests**

Run: `cd frontend && bun run vitest run src/components/__tests__/DateRangeFilter.test.tsx src/components/__tests__/AuthFlow.test.tsx src/routes/__tests__/index.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DateRangeFilter.tsx frontend/src/routes/index.tsx
git commit -m "feat: migrate DateRangeFilter and AuthFlow to theme tokens"
```

---

## Task 11: Final Verification

**Depends on:** All previous tasks

- [ ] **Step 1: Run full test suite**

Run: `cd frontend && bun run vitest run`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `cd frontend && bun run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Run lint/format**

Run: `cd frontend && bun run check`
Expected: No errors (auto-fixes applied if needed)

- [ ] **Step 4: Commit any lint fixes**

If `bun run check` made changes:
```bash
git add -A
git commit -m "style: auto-fix formatting after theme migration"
```
