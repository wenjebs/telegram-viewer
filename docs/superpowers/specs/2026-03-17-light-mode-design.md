# Light Mode Design

## Overview

Add a light mode to the Telegram Viewer app with a sidebar toggle. The color system migrates from hardcoded Tailwind neutral classes to semantic theme tokens via Tailwind v4's `@theme` directive, enabling both light and dark palettes from a single set of utility classes.

## Toggle UI

- **Location**: Sun/moon icon in the sidebar footer, always visible
- **Behavior**: Three-state cycle — system → light → dark
- **Visual indicator**: Sun icon (light), moon icon (dark), auto/monitor icon (system)
- **No settings modal** — the icon is the only UI surface

## Color System

### Approach: Tailwind v4 `@theme` with CSS Variables

Define semantic color tokens in `styles.css` that resolve to CSS variables. These become first-class Tailwind utilities.

```css
@theme {
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
  --color-base: var(--th-base);
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
```

Components then use `bg-surface`, `text-text`, `border-border`, `bg-accent`, etc.

### Token Values

#### Dark Theme (current, under `:root[data-theme='dark']`)

| Token | Value | Usage |
|-------|-------|-------|
| `--th-base` | `#0a1418` | Page background |
| `--th-surface` | `#171c1f` | Card/sidebar backgrounds (≈neutral-900) |
| `--th-surface-alt` | `#1e2528` | Input fields, secondary surfaces (≈neutral-800) |
| `--th-surface-strong` | `#252d31` | Hover states, elevated surfaces |
| `--th-text` | `#e5e5e5` | Primary text (≈neutral-200) |
| `--th-text-soft` | `#a3a3a3` | Secondary text (≈neutral-400) |
| `--th-text-inv` | `#171717` | Text on light backgrounds |
| `--th-accent` | `#0284c7` | Primary action (sky-600) |
| `--th-accent-hover` | `#0369a1` | Hover accent (sky-700) |
| `--th-border` | `#404040` | Borders (≈neutral-700) |
| `--th-border-soft` | `#525252` | Subtle borders (≈neutral-600) |
| `--th-input` | `#1e2528` | Input backgrounds |
| `--th-ring` | `rgba(14,165,233,0.5)` | Focus rings (sky-500/50) |
| `--th-header` | `rgba(10,20,24,0.8)` | Header backdrop |
| `--th-chip` | `rgba(13,28,32,0.9)` | Pill/chip backgrounds |
| `--th-chip-border` | `rgba(141,229,219,0.24)` | Chip borders |
| `--th-hover` | `#292929` | Generic hover bg (≈neutral-800) |
| `--th-badge` | `#10b981` | Badge/status (emerald-500) |
| `--th-badge-text` | `#ffffff` | Badge text |
| `--th-danger` | `#dc2626` | Destructive actions (red-600) |
| `--th-success` | `#10b981` | Success (emerald-500) |
| `--th-warning` | `#d97706` | Warning (amber-600) |

#### Light Theme (new, under `:root[data-theme='light']`)

Teal-tinted palette to stay cohesive with the dark theme's seafoam aesthetic.

| Token | Value | Usage |
|-------|-------|-------|
| `--th-base` | `#f0f5f4` | Page background (teal-tinted off-white) |
| `--th-surface` | `#f8fafa` | Card/sidebar backgrounds |
| `--th-surface-alt` | `#eef3f2` | Input fields, secondary surfaces |
| `--th-surface-strong` | `#e4edeb` | Hover states, elevated surfaces |
| `--th-text` | `#1a3d36` | Primary text (dark teal) |
| `--th-text-soft` | `#5a7d75` | Secondary text |
| `--th-text-inv` | `#e5e5e5` | Text on dark backgrounds |
| `--th-accent` | `#0284c7` | Primary action (sky-600, same) |
| `--th-accent-hover` | `#0369a1` | Hover accent (sky-700, same) |
| `--th-border` | `#d0ddd9` | Borders (teal-tinted gray) |
| `--th-border-soft` | `#bfceca` | Subtle borders |
| `--th-input` | `#ffffff` | Input backgrounds |
| `--th-ring` | `rgba(14,165,233,0.5)` | Focus rings (same) |
| `--th-header` | `rgba(240,245,244,0.85)` | Header backdrop |
| `--th-chip` | `rgba(224,237,234,0.9)` | Pill/chip backgrounds |
| `--th-chip-border` | `rgba(42,110,99,0.2)` | Chip borders |
| `--th-hover` | `#e4edeb` | Generic hover bg |
| `--th-badge` | `#10b981` | Badge/status (same) |
| `--th-badge-text` | `#ffffff` | Badge text (same) |
| `--th-danger` | `#dc2626` | Destructive (same) |
| `--th-success` | `#10b981` | Success (same) |
| `--th-warning` | `#d97706` | Warning (same) |

### System Preference Default

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    /* dark token values */
  }
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    /* light token values */
  }
}
```

When no `data-theme` attribute is set (system mode), the media query determines which palette applies.

## Persistence

- **Default**: System preference (`prefers-color-scheme`)
- **Manual override**: Saved to `localStorage` key `theme` with value `"light"`, `"dark"`, or `"system"`
- **Flash prevention**: Inline `<script>` tag in `RootDocument` (which renders raw `<html>`/`<head>` JSX) right after `<HeadContent />`. This is a static string with no user input — safe from XSS. Runs before React hydrates:

```tsx
// In RootDocument, inside <head>:
<HeadContent />
<script dangerouslySetInnerHTML={{ __html:
  `(function(){` +
    `var t=localStorage.getItem('theme');` +
    `if(t==='light'||t==='dark')` +
      `document.documentElement.setAttribute('data-theme',t);` +
    `else document.documentElement.removeAttribute('data-theme')` +
  `})()`
}} />
```

Note: The content is a hardcoded string literal, not derived from user input, so this usage of dangerouslySetInnerHTML is safe.

## Component Migration

Replace hardcoded Tailwind neutral classes with semantic tokens across all components:

| Old Class | New Class |
|-----------|-----------|
| `bg-neutral-950`, `bg-neutral-900` | `bg-base` or `bg-surface` |
| `bg-neutral-800` | `bg-surface-alt` |
| `bg-neutral-800` (hover) | `bg-surface-strong` or `hover:bg-hover` |
| `text-neutral-200`, `text-white` | `text-text` |
| `text-neutral-400`, `text-neutral-500` | `text-text-soft` |
| `border-neutral-700`, `border-neutral-800` | `border-border` |
| `border-neutral-600` | `border-border-soft` |
| `bg-sky-600` | `bg-accent` |
| `hover:bg-sky-700` | `hover:bg-accent-hover` |
| `focus:ring-sky-500/50` | `focus:ring-ring` |
| `ring-offset-neutral-900` | `ring-offset-base` |

### Components to Update

1. `__root.tsx` — add inline theme script, replace body classes (`bg-neutral-950 text-neutral-200` → `bg-base text-text`), dynamic Toaster theme
2. `Sidebar.tsx` — backgrounds, borders, active states
3. `MediaGrid.tsx` — backgrounds, text colors
4. `MediaCard.tsx` — card bg, select ring offset, overlay text
5. `Lightbox.tsx` — backdrop, controls, metadata panel
6. `SelectionBar.tsx` — floating bar bg, borders, text
7. `PeopleGrid.tsx` — card backgrounds, text
8. `PersonDetail.tsx` — backgrounds, text, input
9. `PersonMergeModal.tsx` — modal bg, borders
10. `KeepPersonPicker.tsx` — modal bg, borders
11. `ShortcutsModal.tsx` — modal bg, text
12. `DateRangeFilter.tsx` — input, calendar styling
13. `AuthFlow.tsx` (in routes/index.tsx) — form backgrounds, input
14. `styles.css` — theme token definitions, remove hardcoded body colors

### Toggle Component

New component: `ThemeToggle.tsx`
- Renders sun/moon/monitor icon based on current theme state
- On click: cycles system → light → dark → system
- Updates `localStorage` and `data-theme` attribute
- No system preference listener needed — when in system mode, `data-theme` is absent and CSS media queries handle switching automatically. The component only needs to track the stored preference for rendering the correct icon.
- Placed in `Sidebar.tsx` footer area

### Existing CSS Variable Cleanup

The existing `styles.css` defines a separate CSS variable system (`--sea-ink`, `--lagoon`, `--surface`, etc.) under `:root` and `:root[data-theme='dark']`, along with decorative classes (`.island-shell`, `.feature-card`, `.nav-link`, `.site-footer`). These are **not used by any app components** — they appear to be leftover from a landing page concept. As part of this work:

- **Remove** all existing `--sea-ink`, `--lagoon`, `--palm`, `--sand`, `--foam`, `--surface`, `--line`, etc. variable definitions
- **Remove** all unused decorative classes (`.island-shell`, `.feature-card`, `.nav-link`, `.site-footer`, `.display-title`, `.island-kicker`)
- **Remove** the hardcoded `background-color: rgb(23 23 23)` on `body`
- **Replace** with the new `@theme` token system and `--th-*` variable definitions
- **Keep** the Google Fonts import and `--font-sans` definition

### Additional Components

These also need theme-aware class updates (missed in initial list):
- `Toaster` in `__root.tsx` — change `theme="dark"` to dynamically reflect active theme
- `NotFound` in `__root.tsx` — replace `text-neutral-400` and `text-blue-400`

## Scope

- **Frontend only** — no backend changes
- **No new dependencies** — icons rendered as inline SVG
- **No settings modal** — sidebar footer icon only
