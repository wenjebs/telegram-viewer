import { useCallback, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import type { DateRange } from 'react-day-picker'
import type { Group, SyncStatus } from '#/api/schemas'
import DateRangeFilter from './DateRangeFilter'

interface Props {
  width: number
  onWidthChange: (width: number) => void
  groups: Group[]
  onToggleGroup: (group: Group) => void
  displayGroupIds: Set<number>
  onToggleDisplayFilter: (groupId: number) => void
  mediaTypeFilter: string | null
  onMediaTypeFilter: (type: string | null) => void
  chatTypeFilter: string | null
  onChatTypeFilter: (type: string | null) => void
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  onSync: () => void
  onClear: () => void
  syncing: boolean
  syncStatuses: Record<number, SyncStatus>
  selectMode?: boolean
  onEnterSelectMode?: () => void
  viewMode?: 'normal' | 'hidden' | 'favorites' | 'people'
  onViewModeChange?: (
    mode: 'normal' | 'hidden' | 'favorites' | 'people',
  ) => void
  personCount?: number
  faceScanning?: boolean
  faceScanScanned?: number
  faceScanTotal?: number
  onStartFaceScan?: () => void
  hiddenCount?: number
  favoritesCount?: number
  showHiddenDialogs?: boolean
  onToggleHiddenDialogs?: () => void
  hiddenDialogs?: Group[]
  onHideDialog?: (group: Group) => void
  onUnhideDialog?: (group: Group) => void
  hiddenDialogCount?: number
}

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

const CHAT_TYPE_ICONS: Record<string, string> = {
  dm: '\u{1F464}',
  group: '\u{1F465}',
  channel: '\u{1F4E2}',
}

const MIN_WIDTH = 200
const MAX_WIDTH = 500

export default function Sidebar({
  width,
  onWidthChange,
  groups,
  onToggleGroup,
  displayGroupIds,
  onToggleDisplayFilter,
  mediaTypeFilter,
  onMediaTypeFilter,
  chatTypeFilter,
  onChatTypeFilter,
  dateRange,
  onDateRangeChange,
  onSync,
  onClear,
  syncing,
  syncStatuses,
  selectMode,
  onEnterSelectMode,
  viewMode = 'normal',
  onViewModeChange,
  hiddenCount = 0,
  favoritesCount = 0,
  showHiddenDialogs,
  onToggleHiddenDialogs,
  hiddenDialogs = [],
  onHideDialog,
  onUnhideDialog,
  hiddenDialogCount = 0,
  personCount = 0,
  faceScanning,
  faceScanScanned,
  faceScanTotal,
  onStartFaceScan,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [chatsCollapsed, setChatsCollapsed] = useState(false)
  const dragging = useRef(false)

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
        onWidthChange(newWidth)
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
    [width, onWidthChange],
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

  const filteredGroups = searchQuery.trim()
    ? fuse
        .search(searchQuery)
        .map((r) => r.item)
        .filter((g) => !chatTypeFilter || g.type === chatTypeFilter)
    : chatTypeFilter
      ? groups.filter((g) => g.type === chatTypeFilter)
      : groups

  return (
    <aside
      className="relative flex h-screen flex-col border-r border-neutral-800 bg-neutral-900"
      style={{ width, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }}
    >
      <div className="flex items-center border-b border-neutral-800">
        <button
          className="flex flex-1 items-center justify-between p-4 text-sm font-semibold hover:bg-neutral-800/50"
          onClick={() => setChatsCollapsed((p) => !p)}
        >
          {showHiddenDialogs ? 'Hidden Chats' : 'Chats'}
          <svg
            className={`h-4 w-4 text-neutral-500 transition-transform${chatsCollapsed ? ' -rotate-90' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        {onToggleHiddenDialogs && (
          <button
            className={`mr-2 rounded p-1.5 text-xs ${
              showHiddenDialogs
                ? 'bg-amber-600/20 text-amber-400'
                : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
            }`}
            onClick={onToggleHiddenDialogs}
            title={
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
        )}
      </div>
      {!chatsCollapsed && (
        <>
          <div className="flex gap-1 border-b border-neutral-800 p-2">
            {CHAT_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                className={`flex-1 rounded px-2 py-1 text-xs ${chatTypeFilter === opt.value ? 'bg-sky-600 text-white' : 'border border-neutral-700 text-neutral-300'}`}
                onClick={() => onChatTypeFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="border-b border-neutral-800 p-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full rounded bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:ring-1 focus:ring-sky-500/50"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {showHiddenDialogs
              ? hiddenDialogs.map((g) => (
                  <div
                    key={g.id}
                    className="group flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-800"
                  >
                    {g.type && CHAT_TYPE_ICONS[g.type] && (
                      <span className="text-xs">{CHAT_TYPE_ICONS[g.type]}</span>
                    )}
                    <span className="flex-1 truncate text-neutral-400">
                      {g.name}
                    </span>
                    {onUnhideDialog && (
                      <button
                        className="shrink-0 rounded p-1 text-neutral-500 opacity-0 hover:bg-neutral-700 hover:text-green-400 group-hover:opacity-100"
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
                    )}
                  </div>
                ))
              : filteredGroups.map((g) => (
                  <div
                    key={g.id}
                    className="group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-800"
                  >
                    <input
                      type="checkbox"
                      checked={g.active}
                      onChange={() => onToggleGroup(g)}
                      className="accent-sky-500"
                    />
                    {g.type && CHAT_TYPE_ICONS[g.type] && (
                      <span className="text-xs">{CHAT_TYPE_ICONS[g.type]}</span>
                    )}
                    <button
                      className={`flex-1 truncate text-left ${
                        displayGroupIds.has(g.id)
                          ? 'font-medium text-sky-300'
                          : ''
                      } disabled:cursor-default disabled:opacity-50`}
                      onClick={() => onToggleDisplayFilter(g.id)}
                      disabled={!g.active}
                      title={
                        g.active
                          ? 'Filter gallery to this chat'
                          : 'Activate to filter'
                      }
                    >
                      {g.name}
                    </button>
                    {syncStatuses[g.id]?.status === 'syncing' &&
                      syncStatuses[g.id].total > 0 && (
                        <span className="ml-auto shrink-0 text-xs text-sky-400">
                          {syncStatuses[g.id].progress.toLocaleString()}
                          {' / '}
                          {syncStatuses[g.id].total.toLocaleString()}
                        </span>
                      )}
                    {onHideDialog && (
                      <button
                        className="shrink-0 rounded p-1 text-neutral-500 opacity-0 hover:bg-neutral-700 hover:text-amber-400 group-hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault()
                          onHideDialog(g)
                        }}
                        title="Hide chat"
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
                          <line x1="2" y1="14" x2="14" y2="2" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
          </div>
        </>
      )}
      {onViewModeChange && (
        <div className="border-t border-neutral-800 p-2">
          <button
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm ${
              viewMode === 'hidden'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
            }`}
            onClick={() =>
              onViewModeChange(viewMode === 'hidden' ? 'normal' : 'hidden')
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
              {viewMode !== 'hidden' && <line x1="2" y1="14" x2="14" y2="2" />}
            </svg>
            <span className="flex-1 text-left">Hidden</span>
            {hiddenCount > 0 && (
              <span className="rounded-full bg-neutral-700 px-1.5 py-0.5 text-xs text-neutral-300">
                {hiddenCount}
              </span>
            )}
          </button>
          <button
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm ${
              viewMode === 'favorites'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
            }`}
            onClick={() =>
              onViewModeChange(
                viewMode === 'favorites' ? 'normal' : 'favorites',
              )
            }
          >
            <span className="text-sm">
              {viewMode === 'favorites' ? '♥' : '♡'}
            </span>
            <span className="flex-1 text-left">Favorites</span>
            {favoritesCount > 0 && (
              <span className="rounded-full bg-neutral-700 px-1.5 py-0.5 text-xs text-neutral-300">
                {favoritesCount}
              </span>
            )}
          </button>
          <button
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm ${
              viewMode === 'people'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
            }`}
            onClick={() =>
              onViewModeChange?.(viewMode === 'people' ? 'normal' : 'people')
            }
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="5.5" cy="5" r="2.5" />
              <circle cx="10.5" cy="5" r="2.5" />
              <path d="M1 14c0-2.2 1.8-4 4-4h.5M15 14c0-2.2-1.8-4-4-4h-.5" />
            </svg>
            <span className="flex-1 text-left">People</span>
            {personCount > 0 && (
              <span className="rounded-full bg-neutral-700 px-1.5 py-0.5 text-xs text-neutral-300">
                {personCount}
              </span>
            )}
          </button>
        </div>
      )}
      <DateRangeFilter
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
      />
      <div className="flex gap-1 border-t border-neutral-800 p-3">
        {MEDIA_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            className={`flex-1 rounded px-2 py-1 text-xs ${mediaTypeFilter === opt.value ? 'bg-sky-600 text-white' : 'border border-neutral-700 text-neutral-300'}`}
            onClick={() => onMediaTypeFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {viewMode === 'people' && onStartFaceScan && (
        <div className="mx-3 mt-3">
          <button
            className="flex w-full items-center justify-center gap-2 rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500 disabled:opacity-50"
            onClick={() => onStartFaceScan()}
            disabled={faceScanning}
          >
            {faceScanning
              ? `Scanning... ${faceScanScanned ?? 0}/${faceScanTotal ?? 0}`
              : 'Scan Faces'}
          </button>
        </div>
      )}
      <div className="m-3 flex gap-2">
        <button
          className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          onClick={onSync}
          disabled={syncing}
        >
          {syncing ? 'Syncing...' : 'Sync'}
        </button>
        <button
          className="rounded-md border border-neutral-600 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          onClick={onClear}
          disabled={syncing}
        >
          Clear
        </button>
        {onEnterSelectMode && (
          <button
            className={`rounded-md border px-3 py-2 text-sm ${
              selectMode
                ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                : 'border-neutral-600 text-neutral-300 hover:bg-neutral-800'
            } disabled:opacity-50`}
            onClick={onEnterSelectMode}
            disabled={syncing || selectMode}
            title="Select mode"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="1" y="1" width="6" height="6" rx="1" />
              <rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" />
              <path d="M11 10l1.5 1.5L15 9" />
            </svg>
          </button>
        )}
      </div>
      <div
        className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-sky-500/40 active:bg-sky-500/60"
        onMouseDown={onMouseDown}
      />
    </aside>
  )
}
