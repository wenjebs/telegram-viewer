import { useMemo, useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { MediaItem, SyncStatus } from '#/api/schemas'
import { extractDateKey } from '#/utils/format'
import MediaCard from './MediaCard'
import DateHeader from './DateHeader'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Props {
  items: MediaItem[]
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
  onItemClick: (item: MediaItem) => void
  syncing: boolean
  syncStatuses: Record<number, SyncStatus>
  selectMode?: boolean
  selectedIds?: Set<number>
  onToggle?: (id: number, event: React.MouseEvent) => void
  onSelectDateGroup?: (items: MediaItem[]) => void
  onLongPress?: (item: MediaItem) => void
  containerRef?: React.RefObject<HTMLDivElement | null>
  dragHandlers?: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onPointerCancel: (e: React.PointerEvent) => void
  }
  selectionRect?: Rect | null
}

export default function MediaGrid({
  items,
  hasMore,
  loading,
  onLoadMore,
  onItemClick,
  syncing,
  syncStatuses,
  selectMode = false,
  selectedIds,
  onToggle,
  onSelectDateGroup,
  onLongPress,
  containerRef,
  dragHandlers,
  selectionRect,
}: Props) {
  const grouped = useMemo(() => groupByDate(items), [items])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Expose the scroll container via both refs
  const setScrollRef = (el: HTMLDivElement | null) => {
    scrollRef.current = el
    if (containerRef) {
      containerRef.current = el
    }
  }

  const virtualizer = useVirtualizer({
    count: grouped.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 300,
    overscan: 3,
  })

  // Auto-load more when scrolled near the end
  const virtualItems = virtualizer.getVirtualItems()
  const lastVirtualItem = virtualItems[virtualItems.length - 1]
  const lastIndex = lastVirtualItem?.index
  useEffect(() => {
    if (lastIndex == null) return
    if (lastIndex >= grouped.length - 1 && hasMore && !loading) {
      onLoadMore()
    }
  }, [lastIndex, grouped.length, hasMore, loading, onLoadMore])

  // #region Empty / syncing states
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
  // #endregion

  // #region Media grid
  return (
    <div
      ref={setScrollRef}
      className="flex-1 overflow-y-auto p-4"
      {...dragHandlers}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const [date, dateItems] = grouped[virtualRow.index]
          const allSelected =
            selectMode &&
            selectedIds != null &&
            dateItems.every((i) => selectedIds.has(i.id))

          return (
            <div
              key={date}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
            >
              <div
                className={`flex items-center gap-2${selectMode ? ' cursor-pointer' : ''}`}
                onClick={
                  selectMode && onSelectDateGroup
                    ? () => onSelectDateGroup(dateItems)
                    : undefined
                }
              >
                {selectMode && (
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded border transition-colors${
                      allSelected
                        ? ' border-blue-500 bg-blue-500 text-white'
                        : ' border-neutral-500 bg-transparent'
                    }`}
                  >
                    {allSelected && (
                      <svg
                        className="h-2.5 w-2.5"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </div>
                )}
                <DateHeader date={date} />
              </div>
              <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                {dateItems.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    onClick={
                      selectMode && onToggle
                        ? (e: React.MouseEvent) => onToggle(item.id, e)
                        : (_e: React.MouseEvent) => onItemClick(item)
                    }
                    selectMode={selectMode}
                    selected={
                      selectMode && selectedIds != null
                        ? selectedIds.has(item.id)
                        : false
                    }
                    onLongPress={
                      onLongPress ? () => onLongPress(item) : undefined
                    }
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {hasMore && (
        <button
          className="mx-auto mt-6 block rounded-md border border-neutral-700 px-6 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Load more'}
        </button>
      )}
      {selectionRect && (
        <div
          className="pointer-events-none fixed z-40 border border-blue-400 bg-blue-400/15"
          style={{
            left: selectionRect.x,
            top: selectionRect.y,
            width: selectionRect.w,
            height: selectionRect.h,
          }}
        />
      )}
    </div>
  )
}

function groupByDate(items: MediaItem[]): [string, MediaItem[]][] {
  const map = new Map<string, MediaItem[]>()
  for (const item of items) {
    const date = extractDateKey(item.date)
    const existing = map.get(date)
    if (existing) {
      existing.push(item)
    } else {
      map.set(date, [item])
    }
  }
  return Array.from(map.entries())
}
