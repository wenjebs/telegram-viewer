# Frontend Architecture

## Stack

React 19, TanStack Start/Router (file-based routing), TanStack Query (data fetching + caching), Tailwind CSS v4, Vite 7, TypeScript strict, bun package manager. Light/dark/system theme support (theme tokens, `data-theme` attribute), Manrope font.

## Components

- **AuthFlow** — multi-step auth: phone input → code verification → optional 2FA password
- **Sidebar** — resizable (200-500px drag handle), reads filter state internally from `useSearchParams()` and width from `useAppStore()`. Calls `useGroups()` and count queries directly (TanStack Query deduplicates). Chat type filter (All/People/Groups/Channels), fuzzy search via Fuse.js, group list with sync control, sync/clear buttons, sync progress display, total synced items count. Filters (date range picker, media type, faces) are conditionally hidden when `viewMode !== 'normal'`. Receives ~9 props (sync handlers, personCount, viewMode) down from ~30.
- **MediaGrid** — virtualized (via `@tanstack/react-virtual`, date-group level) infinite-scroll grid (auto-fill minmax 160px, gap-3) of media items grouped by date, auto-loads more when scrolled near end, progress bar during sync. Supports select mode with clickable date headers, shift-click range selection, and drag rectangle multi-select.
- **MediaCard** — thumbnail with lazy loading, video play icon overlay + duration badge (MM:SS), chat name label (bottom-left pill). Select mode: checkbox overlay, blue ring border, long-press/right-click to enter select mode, dimmed unselected items.
- **DateHeader** — date separator (locale full date string)
- **DateRangeFilter** — collapsible date range picker using react-day-picker in range mode
- **Lightbox** — full-screen modal for media viewing, keyboard nav (Esc/arrows/S/H/F), download button, select/favorite/hide/unhide buttons with key hints, caption display, status indicators (selected check + favorite heart), metadata panel (type, sender, chat, date, dimensions, file size). Auto-triggers pagination when navigating near page boundary.
- **LightboxMedia** — media renderer inside Lightbox handling photo/video playback with loading, error, and placeholder states
- **SelectionBar** — floating bottom pill (fixed position, z-40, slideUp animation). Shows count, select all, deselect, download + favorite (normal view), unhide + delete (hidden view), hide with `onBeforeHide` cross-person check (people view), cancel. Download button shows progress during async zip preparation (files_ready/files_total, then "Building zip..."). Uses `sonner` toasts for error/success feedback instead of inline error state.
- **PeopleGrid** — grid of person cards showing face crop avatars, display names, and face counts. Click to view person detail, cmd+click to enter merge select mode and toggle selection (auto-exits on last deselect), shift+click to inline rename, drag rectangle multi-select for merge.
- **PersonDetail** — media grid filtered to a specific person's face appearances, with rename, merge, and delete (with confirmation) actions
- **PersonMergeModal** — modal for merging two person records, moves all faces from source to target
- **CrossPersonWarningModal** — warning modal when hiding media that has faces belonging to other persons, shows affected persons
- **PhotoContextMenu** — right-click context menu for photos in people view (hide with cross-person check, favorite, download)
- **ShortcutsModal** — keyboard shortcuts reference modal (opened via `?` / shift+slash), lists all app hotkeys grouped by context (General, Lightbox, Selection mode, People select mode, People view). Supports optional `note` field per group for extra context.
- **KeepPersonPicker** — modal to select which person to keep when merging duplicate persons
- **GroupOverflowMenu** — overflow menu for group actions (hide, unsync)
- **ThemeToggle** — theme switcher (light/dark/system) with icon cycling
- **ViewModeTabs** — tab bar for switching between Gallery, Hidden, Favorites, and People modes with item counts
- **SegmentedControl** — reusable button group for filter options (media type, chat type, sync status, faces filter)
- **SettingsPanel** — slide-out panel (lazy-loaded, toggled via `,` key) for theme toggle, cache start button, and backup/restore settings (export/import JSON)
- **EmptyState** — getting-started guidance (3 steps: pick chats, sync, browse) for initial empty gallery
- **SkeletonGroup** — animated skeleton loader for media grid showing fake date header and thumbnail grid
- **ActiveGroupChips** — chip bar showing active syncing groups with click-to-deactivate and "Show all" deselect-all action
- **ViewModeHeader** — banner for hidden/favorites view modes with icon, close button, and Delete All button (hidden mode)
- **PersonBreadcrumb** — selected person name header with back button
- **MediaToolbar** — item count, select mode toggle, sort order button
- **PeopleToolbar** — face scan button, search input, similarity threshold slider with S+↑↓ kbd hint and lenient/strict labels, select/deselect all/close buttons
- **PersonActionBar** — fixed bottom bar for person select mode with select all/deselect/delete (D shortcut)/merge (M shortcut)/exit. Confirmation dialog for delete.
- **CacheProgress** — sidebar progress bar for active cache jobs (running/paused/error states with pause/resume/retry controls). Hidden when idle or cancelled (cache start moved to SettingsPanel).

## State Architecture

| Layer | Tool | What lives here |
|-------|------|-----------------|
| Server state | TanStack Query | media, groups, persons, counts, sync status, face scan, hidden dialogs, auth |
| Client state | Zustand (`appStore`) | sidebarWidth, similarityThreshold, showMergeModal, showShortcuts |
| URL state | TanStack Router `validateSearch` | viewMode, filters, person, item, sort, q, hiddenDialogs |

## Hooks

### Composite hooks (Home decomposition)

- **useHomeData()** — orchestrates all data fetching for the Home route. Calls useSearchParams, useAppStore, useGroups, all media hooks, usePersons, usePersonMedia, useFaceScan, useSelectMode, useSyncStatus, useLightbox, usePersonMerge, usePrefetch. Auth via `useQuery(['auth'])` (retry: false). Hidden dialogs via `useQuery(['hiddenDialogs'], { enabled: showHiddenDialogs })`. Computes activeSource/activeItems/activeLoading/activeHasMore based on viewMode. Returns unified data bag with all query results, computed state, invalidation callbacks, and URL state helpers.
- **useHomeHandlers(params)** — event handlers extracted from Home: handleClear, handleHideDialog, handleUnhideDialog, handleUnsyncGroup, handleViewModeChange, handleToggleHiddenDialogs. Uses useQueryClient internally for cache invalidation.
- **useHomeShortcuts(params)** — all keyboard shortcut registrations (escape, shift+slash, `,` settings toggle, p/g/f/h view mode switches, shift+h, shift+d, S+up/S+down similarity threshold in people view). Reads setShowShortcuts and similarityThreshold from useAppStore.

### Data hooks

- **useInfiniteMediaQuery(queryKey, queryFn, enabled)** — factory hook extracting the shared infinite query pattern (TanStack Query pagination, pages.flatMap item flattening, optimistic removeItem/removeItems). All four media hooks are thin wrappers over this.
- **useGroups({ enabled })** — `useQuery` for group list, optimistic `toggleActive` via `setQueryData`. Fetches `previewCounts` (new media estimates) for active groups via separate `useQuery` (5min staleTime). Returns `{ groups, loading, error, toggleActive, unsyncGroup, activeGroupIds, refetch, previewCounts }`
- **useMedia(filters, enabled)** — thin wrapper over `useInfiniteMediaQuery`. Query key includes filters (`groups`, `type`, `dateFrom`, `dateTo`, `faces`, `sort`) so changing filters auto-refetches. Returns `{ items, loading, error, hasMore, fetchNextPage, removeItem, removeItems }`
- **useHiddenMedia(enabled, sort)** — thin wrapper over `useInfiniteMediaQuery` for hidden items, query key `['media', 'hidden', { sort }]`. Returns `{ items, loading, error, hasMore, fetchNextPage, removeItem, removeItems }`
- **useFavoritesMedia(enabled, sort)** — thin wrapper over `useInfiniteMediaQuery` for favorites, query key `['media', 'favorites', { sort }]`. Returns `{ items, loading, error, hasMore, fetchNextPage, removeItem, removeItems }`
- **usePersonMedia(personId, enabled, sort, faces?)** — thin wrapper over `useInfiniteMediaQuery` for media containing a person's face. Optional `faces` filter (`none`/`solo`/`group`) for filtering by face count. Returns `{ items, loading, error, hasMore, fetchNextPage, removeItem, removeItems }`
- **usePersons(enabled, similarityThreshold)** — `useQuery` for person list + similar-groups query (enabled when 2+ persons). Returns `{ persons, loading, similarGroups, refetch, invalidate }`
- **useFaceScan(options)** — `useMutation` for `POST /faces/scan`, `useQuery` polls scan status (`refetchOnMount: 'always'` to detect in-progress scans on navigation). Auto-stops when done/error. Post-sync polling: `checkAfterSync()` triggers a few extra poll cycles to detect auto-triggered scans. Returns `{ scanning, status, startScan, checkAfterSync }`
- **useCacheJob** — `useQuery` polls cache job status, mutations for start/pause/cancel. Returns `{ status, start, pause, cancel }`
- **useSyncStatus** — triggers sync via `useMutation` (POST `/sync-all`), polls status with TanStack Query `refetchInterval` (2s), auto-stops when all groups reach done/error. Returns `{ syncing, syncStatuses, handleSync }`

### UI hooks

- **useSelectMode** — selection state (active, selectedIds Set, selectedCount, lastClickedId). API: enterSelectMode, exitSelectMode, setSelection, toggle, toggleRange, selectAll, selectDateGroup, deselectAll, isSelected
- **useDragSelect** — drag rectangle multi-select with pointer capture, auto-scroll near edges, hit-test against `[data-item-id]` elements
- **useSearchParams** — wraps `getRouteApi('/').useSearch()` + `useNavigate()` to provide `{ search, setSearch }` for URL-backed state. `setSearch(updates, { replace })` strips undefined values to keep URLs clean. Search schema defined in `src/routes/searchSchema.ts`.
- **useLightbox({ activeItems, selectedItem, setSelectedItem, ... })** — lightbox navigation (prev/next), actions (hide/unhide/favorite/select). Accepts external `selectedItem` and `setSelectedItem` (URL-backed via `?item=` param)
- **usePersonMerge(invalidatePersons)** — manages person merge workflow: select mode for picking merge targets, keep-person picker modal, merge execution with optimistic invalidation
- **useZipDownload** — async zip download with progress. `useMutation` fires `POST /prepare-zip`, `useQuery` polls `/zip-status/{job_id}` every 1s, `useEffect` auto-triggers browser download via `<a>` click when done (no blob buffering). Returns `{ preparing, zipStatus, startDownload }`
- **useTheme** — theme state management (light/dark/system). Persists to localStorage, applies `data-theme` attribute to `<html>`. Returns `{ theme, setTheme }`
- **useSettingsBackup** — export/import settings JSON with file I/O. Invalidates queries on import. Builds import summary with toast feedback.
- **usePrefetch(items, enabled)** — background prefetch of loaded media items. TanStack Query `prefetchQuery` with `staleTime/gcTime: Infinity` for dedup. Concurrent queue (max 3), LIFO order, AbortController cleanup on unmount.

## API Client (`src/api/client.ts`)

Schema-validated fetch wrapper (`fetchJSON(path, schema, init)`) over `/api` prefix (proxied to localhost:8000 via Vite). Every JSON response is validated at runtime via `schema.parse()` (Zod) — no type casting. Shared `ensureOk()` helper for error handling across `fetchJSON` and `downloadZip`. Reusable `SuccessResponse`, `CountResponse`, `IdsResponse`, and `DeleteResponse` schemas for common response shapes. Sync via `startSyncAll` (POST) + polling `getSyncStatus` every 2s. Download zip via async prepare-poll-download flow (no blob buffering); legacy `downloadZip` kept for compatibility. Hide/unhide/favorite/hidden-list/favorites-list endpoints. Permanent delete: `deleteMediaBatch` (by IDs), `deleteAllHidden` (all hidden). ID retrieval: `getMediaIds`, `getHiddenMediaIds`, `getFavoritesMediaIds`, `getPersonMediaIds` for select-all operations. Face endpoints: scan control, person CRUD (list, rename, merge, delete, remove face), cross-person conflict check (`getCrossPersonConflicts`), person media pagination (with optional `faces` filter), face crop URLs. Settings endpoints: `exportSettings()` (JSON file download), `importSettings()` (file upload with import summary).

## Schemas (`src/api/schemas.ts`)

Zod schemas as single source of truth — TypeScript types are inferred via `z.infer<>`. Schemas: AuthStatus, Group, MediaItem (media_type: 'photo'|'video'|'file', hidden_at, favorited_at), MediaPage, SyncStatus (status: 'idle'|'syncing'|'done'|'error'), Person, FaceScanStatus (status: 'idle'|'scanning'|'clustering'|'done'|'error'), ZipJobResponse, ZipStatusResponse (status: 'preparing'|'zipping'|'done'|'error'), PreviewCountItem (photos, videos, documents, total), PreviewCounts (Record<string, PreviewCountItem | null>), ImportResult (settings import summary with applied/skipped counts), ConflictPerson (id, display_name), ConflictsResponse (array of {media_id, persons}). Reusable: SuccessResponse, CountResponse, IdsResponse, DeleteResponse.

## Layout

3-column: sidebar (resizable left panel) | media grid (flex-1 scrollable center) | lightbox (fixed z-50 overlay) + selection bar (fixed z-40 bottom) + shortcuts modal (? key). View indicator banner appears above grid on non-normal views (icon + label + close button: "Hidden Media", "Favorites", "People", or person name). Display filter pills bar below banner when active (with "Show all" reset). ViewMode state ('normal'|'hidden'|'favorites'|'people') switches grid content. People view shows PeopleGrid with face scan controls in sidebar.

Root route (`__root.tsx`) wraps app in `QueryClientProvider` (staleTime: 5 min, refetchOnWindowFocus: true) and mounts `<Toaster />` from sonner (theme-aware via useTheme, bottom-right, rich colors). Injects inline script to prevent theme flash on load. Home component (`src/routes/index.tsx`, ~395 lines) is a thin composition shell that delegates to `useHomeData`, `useHomeHandlers`, `useHomeShortcuts` hooks and extracted sub-components. Auth via `useQuery(['auth'])`, filter/view/navigation state URL-driven via `searchSchema.ts` Zod schema. Data fetching is declarative via TanStack Query hooks — no manual fetch effects.

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
| `sort` | enum | asc, desc | Sort order (default desc = newest first) |
| `sync` | enum | synced, unsynced | Sync status filter |
| `q` | string | any | Sidebar search query (debounced 300ms) |
| `hiddenDialogs` | literal | "1" | Show hidden dialogs toggle |

History behavior: `mode`/`person`/`item` open use push (back button navigates); filters (`media`/`chat`/`from`/`to`/`groups`/`q`) use replace. Lightbox close uses replace to avoid back-button loops. Auto-sets `mode=people` when `person` param is present without `mode`.

## Key Dependencies

@tanstack/react-query (data fetching), @tanstack/react-virtual (virtualized lists), zustand (client state), zod (runtime schema validation), fuse.js (fuzzy search), react-day-picker (date ranges), react-hotkeys-hook (keyboard shortcuts), use-long-press (long-press gesture), lucide-react (icons), sonner (toast notifications), @tanstack/react-start + router, tailwindcss v4

## Tooling

- Format: oxfmt (no semicolons, single quotes, trailing commas, 80 char width)
- Lint: oxlint (react, typescript, unicorn, import plugins)
- Type check: tsgo (`@typescript/native-preview`) — preferred over tsc for speed
- Test: Vitest + React Testing Library + jsdom
- Import alias: `#/*` → `./src/*`
- Pre-commit: `bun run check` (oxfmt --write + oxlint --fix)
