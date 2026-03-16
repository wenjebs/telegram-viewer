import { useCallback, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import type { DateRange } from 'react-day-picker'
import type { Group, SyncStatus } from '#/api/types'
import DateRangeFilter from './DateRangeFilter'

interface Props {
  width: number
  onWidthChange: (width: number) => void
  groups: Group[]
  onToggleGroup: (group: Group) => void
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
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
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
      <h2 className="border-b border-neutral-800 p-4 text-sm font-semibold">
        Chats
      </h2>
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
      {groups.some((g) => g.active) && (
        <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto border-b border-neutral-800 p-2">
          {groups
            .filter((g) => g.active)
            .map((g) => (
              <button
                key={g.id}
                className="flex items-center gap-1 rounded-full bg-sky-600/20 px-2 py-0.5 text-xs text-sky-300 hover:bg-sky-600/30"
                onClick={() => onToggleGroup(g)}
              >
                <span className="max-w-28 truncate">{g.name}</span>
                <span className="text-sky-400/60 hover:text-sky-300">✕</span>
              </button>
            ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredGroups.map((g) => (
          <label
            key={g.id}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-800"
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
            <span className="flex-1 truncate">{g.name}</span>
            {syncStatuses[g.id]?.status === 'syncing' &&
              syncStatuses[g.id].total > 0 && (
                <span className="ml-auto shrink-0 text-xs text-sky-400">
                  {syncStatuses[g.id].progress.toLocaleString()}
                  {' / '}
                  {syncStatuses[g.id].total.toLocaleString()}
                </span>
              )}
          </label>
        ))}
      </div>
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
      </div>
      <div
        className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-sky-500/40 active:bg-sky-500/60"
        onMouseDown={onMouseDown}
      />
    </aside>
  )
}
