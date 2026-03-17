# Frontend Architecture

## Stack

React 19, TanStack Start/Router (file-based routing), TanStack Query (data fetching + caching), Tailwind CSS v4, Vite 7, TypeScript strict, bun package manager. Dark theme (neutral-950 bg), Manrope font.

## Components

- **AuthFlow** — multi-step auth: phone input → code verification → optional 2FA password
- **Sidebar** — resizable (200-500px drag handle), chat type filter (All/People/Groups/Channels), fuzzy search via Fuse.js, group checkboxes (sync control) + clickable group names (display filter), sync/clear buttons, sync progress display, total synced items count, hidden/favorites/people view mode buttons with count badges, select mode toggle button. Filters (date range picker, media type, faces) are conditionally hidden when `viewMode !== 'normal'` since they only apply to the normal gallery view
- **MediaGrid** — virtualized (via `@tanstack/react-virtual`, date-group level) infinite-scroll grid (auto-fill minmax 160px, gap-3) of media items grouped by date, auto-loads more when scrolled near end, progress bar during sync. Supports select mode with clickable date headers, shift-click range selection, and drag rectangle multi-select.
- **MediaCard** — thumbnail with lazy loading, video play icon overlay + duration badge (MM:SS), chat name label (bottom-left pill). Select mode: checkbox overlay, blue ring border, long-press/right-click to enter select mode, dimmed unselected items.
- **DateHeader** — date separator (locale full date string)
- **DateRangeFilter** — collapsible date range picker using react-day-picker in range mode
- **Lightbox** — full-screen modal for media viewing, keyboard nav (Esc/arrows/S/H/F), download button, select/favorite/hide/unhide buttons with key hints, caption display, status indicators (selected check + favorite heart), metadata panel (type, sender, chat, date, dimensions, file size)
- **SelectionBar** — floating bottom pill (fixed position, z-40, slideUp animation). Shows count, select all, deselect, download + favorite (normal view), unhide (hidden view), cancel. Download button shows progress during async zip preparation (files_ready/files_total, then "Building zip..."). Uses `sonner` toasts for error/success feedback instead of inline error state.
- **PeopleGrid** — grid of person cards showing face crop avatars, display names, and face counts. Click to view person detail.
- **PersonDetail** — media grid filtered to a specific person's face appearances, with rename and merge actions
- **PersonMergeModal** — modal for merging two person records, moves all faces from source to target
- **ShortcutsModal** — keyboard shortcuts reference modal (opened via `?` / shift+slash), lists all app hotkeys grouped by context (General, Lightbox, Selection mode)
- **KeepPersonPicker** — modal to select which person to keep when merging duplicate persons
- **GroupOverflowMenu** — overflow menu for group actions (hide, unsync)

## Hooks

- **useGroups({ enabled, displayGroupIds })** — `useQuery` for group list, optimistic `toggleActive` via `setQueryData`. Accepts external `displayGroupIds: Set<number>` (URL-backed). Fetches `previewCounts` (new media estimates) for active groups via separate `useQuery` (5min staleTime). Computed: activeGroupIds, displayFilteredGroupIds. Returns `{ groups, loading, error, toggleActive, activeGroupIds, displayFilteredGroupIds, refetch, previewCounts }`
- **useMedia(filters, enabled)** — `useInfiniteQuery` with cursor pagination (limit 50). Query key includes filters (`groups`, `type`, `dateFrom`, `dateTo`, `faces`) so changing filters auto-refetches. Returns `{ items, loading, error, hasMore, fetchNextPage, removeItem, removeItems }`
- **useHiddenMedia(enabled)** — `useInfiniteQuery` for hidden items, query key `['media', 'hidden']`. Returns `{ items, loading, error, hasMore, fetchNextPage, removeItems }`
- **useFavoritesMedia(enabled)** — `useInfiniteQuery` for favorites, query key `['media', 'favorites']`. Returns `{ items, loading, error, hasMore, fetchNextPage, removeItems }`
- **useSelectMode** — selection state (active, selectedIds Set, selectedCount, lastClickedId). API: enterSelectMode, exitSelectMode, setSelection, toggle, toggleRange, selectAll, selectDateGroup, deselectAll, isSelected
- **useDragSelect** — drag rectangle multi-select with pointer capture, auto-scroll near edges, hit-test against `[data-item-id]` elements
- **useSearchParams** — wraps `Route.useSearch()` + `useNavigate()` to provide `{ search, setSearch }` for URL-backed state. `setSearch(updates, { replace })` strips undefined values to keep URLs clean
- **useLightbox({ activeItems, selectedItem, setSelectedItem, ... })** — lightbox navigation (prev/next), actions (hide/unhide/favorite/select), keyboard shortcuts. Accepts external `selectedItem` and `setSelectedItem` (URL-backed via `?item=` param)
- **useSyncStatus** — triggers sync via `useMutation` (POST `/sync-all`), polls status with TanStack Query `refetchInterval` (2s), auto-stops when all groups reach done/error. Uses `data.started` to track only server-confirmed groups. Returns `{ syncing, syncStatuses, handleSync }`
- **useZipDownload** — async zip download with progress. `useMutation` fires `POST /prepare-zip`, `useQuery` polls `/zip-status/{job_id}` every 1s, `useEffect` auto-triggers browser download via `<a>` click when done (no blob buffering). Returns `{ preparing, zipStatus, startDownload }`
- **useFaceScan(options)** — `useMutation` for `POST /faces/scan`, `useQuery` polls scan status (`refetchOnMount: 'always'` to detect in-progress scans on navigation). Auto-stops when done/error. Returns `{ scanning, status, startScan }`
- **usePersons(enabled, similarityThreshold)** — `useQuery` for person list + similar-groups query (enabled when 2+ persons). Returns `{ persons, loading, similarGroups, refetch, invalidate }`
- **usePersonMerge({ persons, selectedPerson, ... })** — manages person merge workflow: select mode for picking merge targets, keep-person picker modal, merge execution with optimistic invalidation
- **usePersonMedia(personId, enabled)** — `useInfiniteQuery` for media items containing a person's face. Returns `{ items, loading, error, hasMore, fetchNextPage, removeItems }`
- **usePrefetch(items, enabled)** — background prefetch of loaded media items (photos + videos). Uses TanStack Query `prefetchQuery` with `staleTime/gcTime: Infinity` for dedup and tracking. Concurrent queue (max 3), LIFO order (newest pages prefetched first via `unshift`), new pages don't abort in-flight downloads, AbortController cleanup on unmount. Warms both backend disk cache and browser HTTP cache so lightbox loads are instant.

## API Client (`src/api/client.ts`)

Schema-validated fetch wrapper (`fetchJSON(path, schema, init)`) over `/api` prefix (proxied to localhost:8000 via Vite). Every JSON response is validated at runtime via `schema.parse()` (Zod) — no type casting. Shared `ensureOk()` helper for error handling across `fetchJSON` and `downloadZip`. Reusable `SuccessResponse` and `CountResponse` schemas for common response shapes. Sync via `startSyncAll` (POST) + polling `getSyncStatus` every 2s. Download zip via async prepare-poll-download flow (no blob buffering); legacy `downloadZip` kept for compatibility. Hide/unhide/favorite/hidden-list/favorites-list endpoints. Face endpoints: scan control, person CRUD (list, rename, merge, remove face), person media pagination, face crop URLs.

## Schemas (`src/api/schemas.ts`)

Zod schemas as single source of truth — TypeScript types are inferred via `z.infer<>`. Schemas: AuthStatus, Group, MediaItem (media_type: 'photo'|'video'|'file', hidden_at, favorited_at), MediaPage, SyncStatus (status: 'idle'|'syncing'|'done'|'error'), Person, FaceScanStatus (status: 'idle'|'scanning'|'clustering'|'done'|'error'), ZipJobResponse, ZipStatusResponse (status: 'preparing'|'zipping'|'done'|'error'), PreviewCountItem (photos, videos, documents, total), PreviewCounts (Record<string, PreviewCountItem | null>). Reusable: SuccessResponse, CountResponse.

## Layout

3-column: sidebar (resizable left panel) | media grid (flex-1 scrollable center) | lightbox (fixed z-50 overlay) + selection bar (fixed z-40 bottom) + shortcuts modal (? key). View indicator banner appears above grid on non-normal views (icon + label + close button: "Hidden Media", "Favorites", "People", or person name). Display filter pills bar below banner when active (with "Show all" reset). ViewMode state ('normal'|'hidden'|'favorites'|'people') switches grid content. People view shows PeopleGrid with face scan controls in sidebar.

Root route (`__root.tsx`) wraps app in `QueryClientProvider` (staleTime: 5 min, refetchOnWindowFocus: true) and mounts `<Toaster />` from sonner (dark theme, bottom-right, rich colors). Home component manages auth state locally; filter/view/navigation state is URL-driven via TanStack Router `validateSearch` with Zod schema. Data fetching is declarative via TanStack Query hooks — no manual fetch effects.

## URL Search Params

Route `/` uses `validateSearch` with a Zod schema. All params are optional with `.catch(undefined)` for graceful degradation on invalid values. Missing params = defaults. Clean `/` when everything is default.

| Param | Type | Values | Purpose |
|-------|------|--------|---------|
| `mode` | enum | normal, hidden, favorites, people | View mode |
| `person` | number | person ID | Selected person in people view |
| `item` | number | media item ID | Lightbox open item |
| `media` | enum | photo, video | Media type filter |
| `chat` | enum | dm, group, channel | Chat type filter |
| `faces` | enum | none, solo, group | Face count filter |
| `from` | string | YYYY-MM-DD | Date range start |
| `to` | string | YYYY-MM-DD | Date range end |
| `groups` | string | comma-separated IDs | Display filter (e.g. "1,2,3") |
| `q` | string | any | Sidebar search query (debounced 300ms) |
| `hiddenDialogs` | literal | "1" | Show hidden dialogs toggle |

History behavior: `mode`/`person`/`item` open use push (back button navigates); filters (`media`/`chat`/`from`/`to`/`groups`/`q`) use replace. Lightbox close uses replace to avoid back-button loops. Auto-sets `mode=people` when `person` param is present without `mode`.

## Key Dependencies

@tanstack/react-query (data fetching), @tanstack/react-virtual (virtualized lists), zod (runtime schema validation), fuse.js (fuzzy search), react-day-picker (date ranges), react-hotkeys-hook (keyboard shortcuts), use-long-press (long-press gesture), lucide-react (icons), sonner (toast notifications), @tanstack/react-start + router, tailwindcss v4

## Tooling

- Format: oxfmt (no semicolons, single quotes, trailing commas, 80 char width)
- Lint: oxlint (react, typescript, unicorn, import plugins)
- Type check: tsgo (`@typescript/native-preview`) — preferred over tsc for speed
- Test: Vitest + React Testing Library + jsdom
- Import alias: `#/*` → `./src/*`
- Pre-commit: `bun run check` (oxfmt --write + oxlint --fix)
