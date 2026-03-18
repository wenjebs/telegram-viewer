# Home Component Decomposition

## Problem

The `Home` component in `routes/index.tsx` is 1026 lines and owns all application state: URL params, auth, data fetching, event handlers, keyboard shortcuts, and all conditional JSX. Sidebar receives 30 props threaded through from Home. Four infinite query hooks (`useMedia`, `useHiddenMedia`, `useFavoritesMedia`, `usePersonMedia`) are ~90% identical.

## Approach

Full restructure using Zustand for client state, TanStack Query for server state (already in place), and URL params for navigable state (already in place). Extract sub-components and composite hooks so Home becomes a ~80-100 line composition shell.

## State Architecture

| Layer | Tool | What lives here |
|-------|------|-----------------|
| Server state | TanStack Query | media, groups, persons, counts, sync status, face scan, hidden dialogs, auth |
| Client state | Zustand | sidebarWidth, similarityThreshold, showMergeModal, showShortcuts |
| URL state | TanStack Router `validateSearch` | viewMode, filters, person, item, sort, q, hiddenDialogs |

### Zustand Store

Single store, flat shape, no middleware/persist:

```ts
// stores/appStore.ts
interface AppState {
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
  similarityThreshold: number
  setSimilarityThreshold: (value: number) => void
  showMergeModal: boolean
  setShowMergeModal: (show: boolean) => void
  showShortcuts: boolean
  setShowShortcuts: (show: boolean) => void
}
```

### Migrations to TanStack Query

Two pieces of state currently managed as `useState` + `useEffect` move to `useQuery`:

**Auth status** (currently `useState<boolean | null>` + manual fetch in `useEffect`):
```ts
const { data: authStatus, isError } = useQuery({
  queryKey: ['auth'],
  queryFn: getAuthStatus,
  retry: false,
})
const authenticated = isError ? false : (authStatus?.authenticated ?? null)
```
Note: `retry: false` ensures network errors surface immediately as `authenticated = false` (showing the auth flow) instead of leaving a blank screen during retries.

**Hidden dialogs** (currently `useState<Group[]>` + manual fetch with eslint-disable):
```ts
useQuery({
  queryKey: ['hiddenDialogs'],
  queryFn: getHiddenDialogs,
  enabled: showHiddenDialogs,
})
```

## Component Extraction

Six new components extracted from Home's inline JSX:

| Component | Source lines | Responsibility |
|-----------|-------------|----------------|
| `PeopleToolbar` | index.tsx 609-675 | Face scan button, similarity threshold input, select/close buttons |
| `PersonBreadcrumb` | index.tsx 676-707 | Selected person name header with back button |
| `ViewModeHeader` | index.tsx 708-746 | Hidden/favorites banner with icon and close |
| `ActiveGroupChips` | index.tsx 747-766 | Active syncing groups chip bar |
| `PersonMergeBar` | index.tsx 941-984 | Fixed bottom bar for person merge select mode |
| `MediaToolbar` | index.tsx 819-865 | Select mode toggle + sort order button |

Each component reads state from Zustand or `useSearchParams()` where applicable, and accepts minimal props for data only the parent knows.

## Hook Extraction

### Composite hooks from Home

**`useHomeData()`** — data fetching orchestration (Home lines 127-292):
- Calls `useGroups`, `useMedia`, `useHiddenMedia`, `useFavoritesMedia`, `usePersons`, `usePersonMedia`, `useFaceScan`
- Calls count queries: `hiddenCount`, `favoritesCount`, `totalCount`, `hiddenDialogCount`
- Computes `mediaFilters`, `activeSource`, `activeItems`
- Provides `invalidateCounts` and `invalidateActiveMedia` callbacks (used by lightbox, selection bar, and handlers)
- Also calls `useSelectMode`, `useLightbox`, `useSyncStatus`, `usePersonMerge`, `usePrefetch`
- Returns unified data bag with all query results, computed state, and invalidation callbacks

Note: `useDragSelect` (x2 for media + people grids) stays in Home since it requires DOM refs (`gridContainerRef`, `peopleContainerRef`) that are created in the render scope. These are 6 lines and don't warrant a separate hook.

**`useHomeHandlers()`** — event handlers (Home lines 411-513):
- `handleClear`, `handleHideDialog`, `handleUnhideDialog`, `handleUnsyncGroup`, `handleToggleHiddenDialogs`, `handleViewModeChange`
- Reads from `useSearchParams()`, `useQueryClient()`
- Receives `invalidateCounts`, `invalidateActiveMedia` and data dependencies from `useHomeData()` return

**`useHomeShortcuts()`** — keyboard bindings (Home lines 384-408, 517-548):
- All `useHotkeys` calls consolidated in one hook
- Receives handler functions and lightbox state as params

### DRY factory for infinite media queries

**`useInfiniteMediaQuery(queryKey, queryFn, enabled)`** replaces the duplicated pattern across four hooks:
- Shared: `useInfiniteQuery` setup, `getNextPageParam`, `initialPageParam`, `items` flattening via `pages.flatMap`, `removeItem` (singular) and `removeItems` (plural) optimistic cache updates
- Each specific hook becomes a ~5-line wrapper. `useMedia` is slightly larger because it builds a filter-dependent compound key:

```ts
export function useHiddenMedia(enabled: boolean, sort: string) {
  return useInfiniteMediaQuery(
    ['media', 'hidden', { sort }],
    ({ pageParam }) => getHiddenMedia(pageParam, 50, sort),
    enabled,
  )
}

export function useMedia(filters: MediaFilters, enabled: boolean) {
  return useInfiniteMediaQuery(
    ['media', filters],
    ({ pageParam }) => getMedia(pageParam, 50, filters),
    enabled,
  )
}
```

- Eliminates ~150 lines of duplication

## Sidebar Simplification

Sidebar drops from ~30 props to ~10-12 by:

1. Calling `useSearchParams()` directly for filter state it currently receives as props (mediaTypeFilter, chatTypeFilter, syncFilter, facesFilter, dateRange, q, hiddenDialogs)
2. Calling `useGroups()` directly (TanStack Query deduplicates with any other caller)
3. Calling count queries directly (`totalCount`, `hiddenDialogCount`) — TanStack Query deduplicates
4. Reading `useAppStore(s => s.sidebarWidth)` for its own width

Remaining props (cannot be derived independently):
- `onSync`, `onClear`, `syncing`, `syncStatuses` — sync orchestration from `useSyncStatus`
- `onHideDialog`, `onUnhideDialog`, `onUnsyncGroup` — async handlers with cross-cutting cache invalidation
- `personCount` — from `useFaceScan` status (owned by `useHomeData`)

### Circular import note

`useSearchParams` imports `Route` from `routes/index.tsx`. Extracted components importing `useSearchParams` while also being imported by `index.tsx` creates a module cycle. This is safe in practice (TanStack Router's `createFileRoute` lazy-evaluates), but if it causes issues, move `searchSchema` to a shared `src/routes/searchSchema.ts` and update `useSearchParams` to import from there.

## Final Home Shell

```
Home()
├── useAppStore()          — modals
├── useSearchParams()      — URL state
├── useHomeData()          — all TanStack Query orchestration
├── useHomeHandlers()      — event handlers
├── useHomeShortcuts()     — keyboard bindings
│
├── if !authenticated → <AuthFlow />
├── <Sidebar />
├── <ViewModeTabs />
├── <PeopleToolbar />      — conditional on viewMode=people, no selectedPerson
├── <PersonBreadcrumb />   — conditional on selectedPerson
├── <ViewModeHeader />     — conditional on hidden/favorites
├── <ActiveGroupChips />   — conditional on active groups
├── <PeopleGrid /> or <>
│   ├── <PersonDetail />   — conditional on selectedPerson
│   ├── <MediaToolbar />
│   └── <MediaGrid />
│   </>
├── <Lightbox />           — conditional
├── <SelectionBar />       — conditional
├── <PersonMergeBar />     — conditional
├── <KeepPersonPicker />   — conditional
├── <PersonMergeModal />   — conditional
└── <ShortcutsModal />     — conditional
```

The `searchSchema` and `Route` export remain in `index.tsx` — only the `Home` function body is rewritten.

Target: ~80-100 lines (accounts for hook calls, conditional rendering, and Suspense wrappers). No behavior changes. Same UI, URL structure, and keyboard shortcuts.

## New Dependency

`zustand` — add via `bun add zustand`

## Files Changed

| Action | Path |
|--------|------|
| Create | `src/stores/appStore.ts` |
| Create | `src/hooks/useInfiniteMediaQuery.ts` |
| Create | `src/hooks/useHomeData.ts` |
| Create | `src/hooks/useHomeHandlers.ts` |
| Create | `src/hooks/useHomeShortcuts.ts` |
| Create | `src/components/PeopleToolbar.tsx` |
| Create | `src/components/PersonBreadcrumb.tsx` |
| Create | `src/components/ViewModeHeader.tsx` |
| Create | `src/components/ActiveGroupChips.tsx` |
| Create | `src/components/PersonMergeBar.tsx` |
| Create | `src/components/MediaToolbar.tsx` |
| Rewrite | `src/routes/index.tsx` |
| Rewrite | `src/components/Sidebar.tsx` |
| Rewrite | `src/hooks/useMedia.ts` |
| Rewrite | `src/hooks/useHiddenMedia.ts` |
| Rewrite | `src/hooks/useFavoritesMedia.ts` |
| Rewrite | `src/hooks/usePersonMedia.ts` |

## Testing Strategy

**Test-driven development (TDD):** Write failing tests for each new unit first, then implement to make them pass.

- Write tests for `useInfiniteMediaQuery` factory before refactoring the four media hooks
- Write tests for `appStore` (Zustand store) before creating it
- Write tests for each extracted composite hook (`useHomeData`, `useHomeHandlers`) before implementing
- Write tests for each extracted component (`PeopleToolbar`, `PersonBreadcrumb`, `ViewModeHeader`, `ActiveGroupChips`, `PersonMergeBar`, `MediaToolbar`) before extracting
- All 292 existing tests must continue to pass after refactor
- Extracted units are testable in isolation, improving coverage over the current monolithic Home
