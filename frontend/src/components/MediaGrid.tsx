import { useMemo } from 'react'
import type { MediaItem, SyncStatus } from '#/api/types'
import MediaCard from './MediaCard'
import DateHeader from './DateHeader'

interface Props {
  items: MediaItem[]
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
  onItemClick: (item: MediaItem) => void
  syncing: boolean
  syncStatuses: Record<number, SyncStatus>
}

export default function MediaGrid({
  items,
  hasMore,
  loading,
  onLoadMore,
  onItemClick,
  syncing,
  syncStatuses,
}: Props) {
  const grouped = useMemo(() => groupByDate(items), [items])

  if (items.length === 0 && !loading) {
    if (syncing) {
      const totals = Object.values(syncStatuses).reduce(
        (acc, s) => ({
          progress: acc.progress + s.progress,
          total: acc.total + s.total,
        }),
        { progress: 0, total: 0 },
      )
      const pct =
        totals.total > 0
          ? Math.round((totals.progress / totals.total) * 100)
          : 0

      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-neutral-400">
          <span className="text-sm">
            {totals.total > 0
              ? `Syncing... ${totals.progress.toLocaleString()} / ${totals.total.toLocaleString()} items`
              : 'Syncing...'}
          </span>
          <div className="h-2 w-64 overflow-hidden rounded-full bg-neutral-700">
            <div
              className={`h-full rounded-full bg-sky-600 transition-all duration-300${totals.total === 0 ? ' animate-pulse' : ''}`}
              style={{
                width: `${totals.total > 0 ? pct : 100}%`,
              }}
            />
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-1 items-center justify-center p-8 text-neutral-500">
        No media found. Select some groups and sync to get started.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {grouped.map(([date, dateItems]) => (
        <div
          key={date}
          className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
        >
          <DateHeader date={date} />
          <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1">
            {dateItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onClick={() => onItemClick(item)}
              />
            ))}
          </div>
        </div>
      ))}
      {hasMore && (
        <button
          className="mx-auto mt-6 block rounded-md border border-neutral-700 px-6 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  )
}

function groupByDate(items: MediaItem[]): [string, MediaItem[]][] {
  const sorted = [...items].toSorted((a, b) => b.date.localeCompare(a.date))
  const map = new Map<string, MediaItem[]>()
  for (const item of sorted) {
    const date = item.date.split('T')[0]
    const existing = map.get(date)
    if (existing) {
      existing.push(item)
    } else {
      map.set(date, [item])
    }
  }
  return Array.from(map.entries())
}
