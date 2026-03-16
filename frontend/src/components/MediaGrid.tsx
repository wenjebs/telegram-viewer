import type { MediaItem } from '#/api/types'
import MediaCard from './MediaCard'
import DateHeader from './DateHeader'

interface Props {
  items: MediaItem[]
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
  onItemClick: (item: MediaItem) => void
}

export default function MediaGrid({
  items,
  hasMore,
  loading,
  onLoadMore,
  onItemClick,
}: Props) {
  const grouped = groupByDate(items)

  if (items.length === 0 && !loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-neutral-500">
        No media found. Select some groups and sync to get started.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {grouped.map(([date, dateItems]) => (
        <div key={date}>
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
  const map = new Map<string, MediaItem[]>()
  for (const item of items) {
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
