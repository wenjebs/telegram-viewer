import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useQuery } from '@tanstack/react-query'
import { Megaphone, Settings, User, Users } from 'lucide-react'
import Fuse from 'fuse.js'
import type { DateRange } from 'react-day-picker'
import type { Group, SyncStatus } from '#/api/schemas'
import {
  getHiddenDialogs,
  getHiddenDialogCount,
  getMediaCount,
} from '#/api/client'
import { useSearchParams } from '#/hooks/useSearchParam'
import { useAppStore } from '#/stores/appStore'
import { useGroups } from '#/hooks/useGroups'
import { formatDateParam } from '#/utils/format'

import CacheProgress from './CacheProgress'
import DateRangeFilter from './DateRangeFilter'
import GroupOverflowMenu from './GroupOverflowMenu'
import { SegmentedControl } from './SegmentedControl'

const SettingsPanel = lazy(() => import('./SettingsPanel'))

interface Props {
  onSync: () => void
  onClear: () => void
  syncing: boolean
  syncStatuses: Record<number, SyncStatus>
  onHideDialog: (group: Group) => void
  onUnhideDialog: (group: Group) => void
  onUnsyncGroup: (group: Group) => void
  personCount: number
  viewMode: string
}

const FACES_FILTER_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'No people', value: 'none' },
  { label: 'Solo', value: 'solo' },
  { label: 'Group', value: 'group' },
]

const MEDIA_TYPE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'Photos', value: 'photo' },
  { label: 'Videos', value: 'video' },
]

const CHAT_TYPE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'People', value: 'dm' },
  { label: 'Groups', value: 'group' },
  { label: 'Channels', value: 'channel' },
]

const SYNC_FILTER_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'Synced', value: 'synced' },
  { label: 'Unsynced', value: 'unsynced' },
]

const CHAT_TYPE_ICONS: Record<string, typeof User> = {
  dm: User,
  group: Users,
  channel: Megaphone,
}

function ChatTypeIcon({ type }: { type: string }) {
  const Icon = CHAT_TYPE_ICONS[type]
  if (!Icon) return null
  return <Icon className="size-3.5 shrink-0 text-text-soft" />
}

const MIN_WIDTH = 200
const MAX_WIDTH = 500

function FilterDisclosure({
  dateRange,
  onDateRangeChange,
  mediaTypeFilter,
  onMediaTypeFilter,
  facesFilter,
  onFacesFilter,
  personCount,
}: {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  mediaTypeFilter: string | null
  onMediaTypeFilter: (type: string | null) => void
  facesFilter: string | null
  onFacesFilter: (value: string | null) => void
  personCount: number
}) {
  const [expanded, setExpanded] = useState(false)
  useHotkeys('slash', () => setExpanded((e) => !e))

  const hasActiveFilters =
    mediaTypeFilter != null || facesFilter != null || dateRange != null

  return (
    <div className="border-t border-border">
      <button
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold text-text-soft hover:text-text"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label="Filters"
      >
        <svg
          className={`h-3 w-3 transition-transform ${expanded ? '' : '-rotate-90'}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
        Filters
        {hasActiveFilters && (
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        )}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-250 ease-in-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <DateRangeFilter
            dateRange={dateRange}
            onDateRangeChange={onDateRangeChange}
          />
          <div className="border-t border-border p-3">
            <SegmentedControl
              options={MEDIA_TYPE_OPTIONS}
              value={mediaTypeFilter}
              onChange={onMediaTypeFilter}
              label="Media type filter"
            />
          </div>
          {personCount > 0 && (
            <div className="border-t border-border p-3">
              <SegmentedControl
                options={FACES_FILTER_OPTIONS}
                value={facesFilter}
                onChange={onFacesFilter}
                label="Face count filter"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Sidebar({
  onSync,
  onClear,
  syncing,
  syncStatuses,
  onHideDialog,
  onUnhideDialog,
  onUnsyncGroup,
  personCount = 0,
  viewMode = 'normal',
}: Props) {
  // Read state from hooks instead of props
  const { search, setSearch } = useSearchParams()
  const width = useAppStore((s) => s.sidebarWidth)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)

  const { groups, toggleActive, bulkSetActive, previewCounts } = useGroups()

  const showHiddenDialogs = search.hiddenDialogs ?? false
  const chatTypeFilter = search.chat ?? null
  const syncFilter = search.sync ?? null
  const mediaTypeFilter = search.media ?? null
  const facesFilter = search.faces ?? null
  const dateFrom = search.from
  const dateTo = search.to
  const dateRange: DateRange | undefined = useMemo(
    () =>
      dateFrom || dateTo
        ? {
            from: dateFrom ? new Date(dateFrom) : undefined,
            to: dateTo ? new Date(dateTo) : undefined,
          }
        : undefined,
    [dateFrom, dateTo],
  )

  // Count queries (TanStack Query deduplicates with useHomeData)
  const { data: totalCount = 0 } = useQuery({
    queryKey: ['counts', 'total'],
    queryFn: () => getMediaCount().then((r) => r.count),
  })
  const { data: hiddenDialogCount = 0 } = useQuery({
    queryKey: ['counts', 'hiddenDialogs'],
    queryFn: () => getHiddenDialogCount().then((r) => r.count),
  })
  const { data: hiddenDialogs = [] } = useQuery({
    queryKey: ['hiddenDialogs'],
    queryFn: getHiddenDialogs,
    enabled: showHiddenDialogs,
  })

  // Local UI state
  const [showSettings, setShowSettings] = useState(false)
  const [localSearchQuery, setLocalSearchQuery] = useState(search.q ?? '')
  const deferredQuery = useDeferredValue(localSearchQuery)
  const [chatsCollapsed, setChatsCollapsed] = useState(false)
  useHotkeys('c', () => setChatsCollapsed((p) => !p))
  const dragging = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  // URL state setters
  const setChatTypeFilter = useCallback(
    (v: string | null) =>
      setSearch(
        { chat: (v as 'dm' | 'group' | 'channel') ?? undefined },
        { replace: true },
      ),
    [setSearch],
  )
  const setSyncFilter = useCallback(
    (v: string | null) =>
      setSearch(
        { sync: (v as 'synced' | 'unsynced') ?? undefined },
        { replace: true },
      ),
    [setSearch],
  )
  const setMediaTypeFilter = useCallback(
    (v: string | null) =>
      setSearch(
        { media: (v as 'photo' | 'video') ?? undefined },
        { replace: true },
      ),
    [setSearch],
  )
  const setFacesFilter = useCallback(
    (v: string | null) =>
      setSearch(
        { faces: (v as 'none' | 'solo' | 'group') ?? undefined },
        { replace: true },
      ),
    [setSearch],
  )
  const setDateRange = useCallback(
    (dr: DateRange | undefined) =>
      setSearch(
        {
          from: dr?.from ? formatDateParam(dr.from) : undefined,
          to: dr?.to ? formatDateParam(dr.to) : undefined,
        },
        { replace: true },
      ),
    [setSearch],
  )
  const handleToggleHiddenDialogs = useCallback(() => {
    setSearch(
      { hiddenDialogs: showHiddenDialogs ? undefined : true },
      { replace: true },
    )
  }, [setSearch, showHiddenDialogs])

  const handleSearchQueryChange = useCallback(
    (query: string) => {
      setLocalSearchQuery(query)
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(
        () => setSearch({ q: query || undefined }, { replace: true }),
        300,
      )
    },
    [setSearch],
  )

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      const startX = e.clientX
      const startWidth = width

      const onMouseMove = (ev: MouseEvent) => {
        const newWidth = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWidth + ev.clientX - startX),
        )
        setSidebarWidth(newWidth)
      }

      const onMouseUp = () => {
        dragging.current = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [width, setSidebarWidth],
  )
  const fuse = useMemo(
    () =>
      new Fuse(groups, {
        keys: ['name'],
        threshold: 0.5,
        ignoreLocation: true,
        minMatchCharLength: 1,
      }),
    [groups],
  )

  const syncMatch = (g: Group) =>
    !syncFilter ||
    (syncFilter === 'synced'
      ? (g.media_count ?? 0) > 0
      : (g.media_count ?? 0) === 0)

  const filteredGroups = (
    deferredQuery.trim()
      ? fuse
          .search(deferredQuery)
          .map((r) => r.item)
          .filter((g) => !chatTypeFilter || g.type === chatTypeFilter)
      : chatTypeFilter
        ? groups.filter((g) => g.type === chatTypeFilter)
        : groups
  ).filter(syncMatch)

  const filteredHiddenDialogs = deferredQuery.trim()
    ? hiddenDialogs.filter(
        (g) =>
          (!chatTypeFilter || g.type === chatTypeFilter) &&
          g.name.toLowerCase().includes(deferredQuery.toLowerCase()),
      )
    : chatTypeFilter
      ? hiddenDialogs.filter((g) => g.type === chatTypeFilter)
      : hiddenDialogs

  return (
    <aside
      className="relative flex h-dvh flex-col border-r border-border bg-surface"
      style={{ width, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }}
    >
      {showSettings ? (
        <Suspense fallback={null}>
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </Suspense>
      ) : (
        <>
          <div className="flex items-center border-b border-border">
            <button
              className="flex flex-1 items-center justify-between p-4 text-sm font-semibold hover:bg-hover/50"
              onClick={() => setChatsCollapsed((p) => !p)}
            >
              {showHiddenDialogs ? 'Hidden Chats' : 'Chats'}
              <svg
                className={`h-4 w-4 text-text-soft transition-transform${chatsCollapsed ? ' -rotate-90' : ''}`}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>
            <button
              className={`mr-2 flex items-center justify-center rounded p-1.5 text-xs ${
                showHiddenDialogs
                  ? 'bg-warning/20 text-warning'
                  : 'text-text-soft hover:bg-hover hover:text-text'
              }`}
              onClick={handleToggleHiddenDialogs}
              title={
                showHiddenDialogs ? 'Show visible chats' : 'Show hidden chats'
              }
              aria-label={
                showHiddenDialogs ? 'Show visible chats' : 'Show hidden chats'
              }
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                <circle cx="8" cy="8" r="2" />
                <line x1="2" y1="14" x2="14" y2="2" />
              </svg>
              {hiddenDialogCount > 0 && (
                <span className="ml-1">{hiddenDialogCount}</span>
              )}
            </button>
          </div>
          <div
            className="grid transition-[grid-template-rows] duration-250 ease-in-out"
            style={{
              gridTemplateRows: chatsCollapsed ? '0fr' : '1fr',
            }}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="border-b border-border p-2">
                <SegmentedControl
                  options={CHAT_TYPE_OPTIONS}
                  value={chatTypeFilter}
                  onChange={setChatTypeFilter}
                  label="Chat type filter"
                />
              </div>
              <div className="border-b border-border p-2">
                <SegmentedControl
                  options={SYNC_FILTER_OPTIONS}
                  value={syncFilter}
                  onChange={setSyncFilter}
                  label="Sync status filter"
                />
              </div>
              <div className="border-b border-border p-2">
                <input
                  type="text"
                  value={localSearchQuery}
                  onChange={(e) => handleSearchQueryChange(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full rounded bg-surface-alt px-3 py-1.5 text-sm text-text placeholder-text-soft outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </div>
          {!chatsCollapsed && (
            <>
              {!showHiddenDialogs && filteredGroups.length > 0 && (
                <div className="flex items-center gap-1 border-b border-border px-2 py-1">
                  <button
                    type="button"
                    className="rounded px-2 py-0.5 text-xs text-text-soft hover:bg-hover hover:text-text"
                    onClick={() => bulkSetActive(filteredGroups, true)}
                    title="Activate all chats in current view"
                  >
                    Select all
                  </button>
                  <span className="text-xs text-border">·</span>
                  <button
                    type="button"
                    className="rounded px-2 py-0.5 text-xs text-text-soft hover:bg-hover hover:text-text"
                    onClick={() =>
                      bulkSetActive(
                        groups.filter((g) => g.active),
                        false,
                      )
                    }
                    title="Deactivate all active chats"
                  >
                    Deselect all
                  </button>
                  <span className="ml-auto text-xs text-text-soft">
                    {`${filteredGroups.filter((g) => g.active).length} / ${filteredGroups.length}`}
                  </span>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-2">
                {showHiddenDialogs
                  ? filteredHiddenDialogs.map((g) => (
                      <div
                        key={g.id}
                        className="group flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-hover"
                      >
                        {g.type && CHAT_TYPE_ICONS[g.type] && (
                          <ChatTypeIcon type={g.type} />
                        )}
                        <span className="flex-1 truncate text-text-soft">
                          {g.name}
                        </span>
                        <button
                          className="shrink-0 rounded p-1 text-text-soft opacity-0 hover:bg-surface-strong hover:text-success focus:opacity-100 group-hover:opacity-100"
                          onClick={() => onUnhideDialog(g)}
                          title="Unhide"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                            <circle cx="8" cy="8" r="2" />
                          </svg>
                        </button>
                      </div>
                    ))
                  : filteredGroups.map((g) => (
                      <div
                        role="button"
                        tabIndex={0}
                        key={g.id}
                        className={`group mb-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          g.active
                            ? 'bg-hover/50 hover:bg-hover'
                            : 'opacity-50 hover:bg-hover hover:opacity-75'
                        }`}
                        onClick={() => toggleActive(g)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleActive(g)
                          }
                        }}
                        title={
                          g.active ? 'Click to deactivate' : 'Click to activate'
                        }
                      >
                        {g.type && CHAT_TYPE_ICONS[g.type] && (
                          <ChatTypeIcon type={g.type} />
                        )}
                        {(g.media_count ?? 0) > 0 && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                            title={`${g.media_count} media synced`}
                          />
                        )}
                        <span className="flex-1 truncate text-left">
                          {g.name}
                        </span>
                        {syncStatuses[g.id]?.status === 'syncing' &&
                          syncStatuses[g.id].total > 0 && (
                            <span className="ml-auto shrink-0 text-xs text-accent">
                              {syncStatuses[g.id].progress.toLocaleString()}
                              {' / '}
                              {syncStatuses[g.id].total.toLocaleString()}
                            </span>
                          )}
                        {syncStatuses[g.id]?.status !== 'syncing' &&
                          previewCounts[String(g.id)]?.total != null &&
                          previewCounts[String(g.id)]!.total > 0 && (
                            <span className="ml-auto shrink-0 rounded-full bg-surface-strong/60 px-1.5 py-0.5 text-[10px] text-text-soft">
                              ~
                              {previewCounts[
                                String(g.id)
                              ]!.total.toLocaleString()}{' '}
                              new
                            </span>
                          )}
                        <GroupOverflowMenu
                          group={g}
                          syncStatus={syncStatuses[g.id]}
                          onHide={onHideDialog}
                          onUnsync={onUnsyncGroup}
                        />
                      </div>
                    ))}
              </div>
            </>
          )}
          {(viewMode === 'normal' ||
            (viewMode === 'people' && search.person != null)) && (
            <FilterDisclosure
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              mediaTypeFilter={mediaTypeFilter}
              onMediaTypeFilter={setMediaTypeFilter}
              facesFilter={facesFilter}
              onFacesFilter={setFacesFilter}
              personCount={personCount}
            />
          )}
          {totalCount > 0 && (
            <div className="px-3 pt-2 text-center text-xs text-text-soft">
              {totalCount.toLocaleString()} items synced
            </div>
          )}
          <div className="px-3 pb-2">
            <CacheProgress />
          </div>
          <div className="m-3 flex gap-2">
            <button
              className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              onClick={onSync}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
            <button
              className="rounded-md border border-danger/40 px-3 py-2 text-sm text-danger hover:border-danger hover:bg-danger/10 disabled:opacity-50"
              onClick={onClear}
              disabled={syncing}
            >
              Clear
            </button>
          </div>
          <div className="flex items-center justify-center border-t border-border py-2">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
              className="rounded-md p-1.5 text-text-soft transition-colors hover:bg-hover hover:text-text"
            >
              <Settings className="size-4" />
            </button>
          </div>
        </>
      )}
      <div
        className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/40 active:bg-accent/60"
        onMouseDown={onMouseDown}
      />
    </aside>
  )
}
