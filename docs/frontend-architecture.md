# Frontend Architecture

## Stack

React 19, TanStack Start/Router (file-based routing), TanStack Query (data fetching + caching), Tailwind CSS v4, Vite 7, TypeScript strict, bun package manager. Dark theme (neutral-950 bg), Manrope font.

## Components

- **AuthFlow** — multi-step auth: phone input → code verification → optional 2FA password
- **Sidebar** — resizable (200-500px drag handle), chat type filter (All/People/Groups/Channels), fuzzy search via Fuse.js, group checkboxes (sync control) + clickable group names (display filter), sync/clear buttons, sync progress display, collapsible date range picker, media type filter, hidden/favorites album entries with count badges, select mode toggle button
- **MediaGrid** — virtualized (via `@tanstack/react-virtual`, date-group level) infinite-scroll grid (auto-fill minmax 160px, gap-3) of media items grouped by date, auto-loads more when scrolled near end, progress bar during sync. Supports select mode with clickable date headers, shift-click range selection, and drag rectangle multi-select.
- **MediaCard** — thumbnail with lazy loading, video play icon overlay + duration badge (MM:SS). Select mode: checkbox overlay, blue ring border, long-press/right-click to enter select mode, dimmed unselected items.
- **DateHeader** — date separator (locale full date string)
- **DateRangeFilter** — collapsible date range picker using react-day-picker in range mode
- **Lightbox** — full-screen modal for media viewing, keyboard nav (Esc/arrows/S/H/F), download button, select/favorite/hide/unhide buttons with key hints, caption display, status indicators (selected check + favorite heart), metadata panel (type, sender, chat, date, dimensions, file size)
- **SelectionBar** — floating bottom pill (fixed position, z-40, slideUp animation). Shows count, select all, deselect, download + favorite (normal view), unhide (hidden view), cancel. Uses `sonner` toasts for error/success feedback instead of inline error state.

## Hooks

- **useGroups(enabled)** — `useQuery` for group list, optimistic `toggleActive` via `setQueryData`, display filter state (displayGroupIds Set). Computed: activeGroupIds, displayFilteredGroupIds
- **useMedia(filters, enabled)** — `useInfiniteQuery` with cursor pagination (limit 50). Query key includes filters (`groups`, `type`, `dateFrom`, `dateTo`) so changing filters auto-refetches. Returns `{ items, loading, hasMore, fetchNextPage, removeItem, removeItems }`
- **useHiddenMedia(enabled)** — `useInfiniteQuery` for hidden items, query key `['media', 'hidden']`. Returns `{ items, loading, hasMore, fetchNextPage, removeItems }`
- **useFavoritesMedia(enabled)** — `useInfiniteQuery` for favorites, query key `['media', 'favorites']`. Returns `{ items, loading, hasMore, fetchNextPage, removeItems }`
- **useSelectMode** — selection state (active, selectedIds Set, lastClickedId). API: enterSelectMode, exitSelectMode, toggle, toggleRange, selectAll, selectDateGroup, deselectAll, isSelected
- **useDragSelect** — drag rectangle multi-select with pointer capture, auto-scroll near edges, hit-test against `[data-item-id]` elements
- **useLightbox** — lightbox navigation (prev/next), actions (hide/unhide/favorite/select), keyboard shortcuts
- **useSyncStatus** — triggers sync via `useMutation` (POST `/sync-all`), polls status with TanStack Query `refetchInterval` (2s), auto-stops when all groups reach done/error. Uses `data.started` to track only server-confirmed groups. Returns `{ syncing, syncStatuses, handleSync }`
- **usePrefetch(items, enabled)** — background prefetch of loaded media items (photos + videos). Uses TanStack Query `prefetchQuery` with `staleTime/gcTime: Infinity` for dedup and tracking. Concurrent queue (max 3), LIFO order (newest pages prefetched first via `unshift`), new pages don't abort in-flight downloads, AbortController cleanup on unmount. Warms both backend disk cache and browser HTTP cache so lightbox loads are instant.

## API Client (`src/api/client.ts`)

Schema-validated fetch wrapper (`fetchJSON(path, schema, init)`) over `/api` prefix (proxied to localhost:8000 via Vite). Every JSON response is validated at runtime via `schema.parse()` (Zod) — no type casting. Shared `ensureOk()` helper for error handling across `fetchJSON` and `downloadZip`. Reusable `SuccessResponse` and `CountResponse` schemas for common response shapes. Sync via `startSyncAll` (POST) + polling `getSyncStatus` every 2s. Download zip via raw fetch for blob response. Hide/unhide/favorite/hidden-list/favorites-list endpoints.

## Schemas (`src/api/schemas.ts`)

Zod schemas as single source of truth — TypeScript types are inferred via `z.infer<>`. Schemas: AuthStatus, Group, MediaItem (media_type: 'photo'|'video'|'file', hidden_at, favorited_at), MediaPage, SyncStatus (status: 'idle'|'syncing'|'done'|'error'). Reusable: SuccessResponse, CountResponse.

## Layout

3-column: sidebar (resizable left panel) | media grid (flex-1 scrollable center) | lightbox (fixed z-50 overlay) + selection bar (fixed z-40 bottom). Display filter pills bar above grid when active (with "Show all" reset). ViewMode state ('normal'|'hidden'|'favorites') switches grid content.

Root route (`__root.tsx`) wraps app in `QueryClientProvider` (staleTime: Infinity, no refetch on focus) and mounts `<Toaster />` from sonner (dark theme, bottom-right, rich colors). Home component manages auth/filter/view state; data fetching is declarative via TanStack Query hooks — no manual fetch effects.

## Key Dependencies

@tanstack/react-query (data fetching), @tanstack/react-virtual (virtualized lists), zod (runtime schema validation), fuse.js (fuzzy search), react-day-picker (date ranges), lucide-react (icons), sonner (toast notifications), @tanstack/react-start + router, tailwindcss v4

## Tooling

- Format: oxfmt (no semicolons, single quotes, trailing commas, 80 char width)
- Lint: oxlint (react, typescript, unicorn, import plugins)
- Test: Vitest + React Testing Library + jsdom
- Import alias: `#/*` → `./src/*`
- Pre-commit: `bun run check` (oxfmt --write + oxlint --fix)
