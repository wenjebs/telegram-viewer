import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { MediaItem, SyncStatus } from '#/api/schemas'
import { extractDateKey } from '#/utils/format'
import MediaCard from './MediaCard'
import DateHeader from './DateHeader'
import { EmptyState } from '#/components/EmptyState'
import SkeletonGroup from './SkeletonGroup'

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

  // 1. Track container width via ResizeObserver
  const [containerWidth, setContainerWidth] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)

  // Expose the scroll container via both refs + attach ResizeObserver
  const setScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      // Detach previous observer
      if (roRef.current) {
        roRef.current.disconnect()
        roRef.current = null
      }
      scrollRef.current = el
      if (containerRef) {
        containerRef.current = el
      }
      // Attach observer to new element
      if (el) {
        const ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            setContainerWidth(entry.contentRect.width)
          }
        })
        ro.observe(el)
        roRef.current = ro
      }
    },
    [containerRef],
  )

  // 2. Dynamic estimateSize based on item count and column count
  const GAP = 12 // gap-3
  const ROW_PADDING = 12 // p-3
  const SCROLL_PADDING = 16 // p-4
  const MIN_COL = 160

  const skeletonCols = useMemo(() => {
    if (containerWidth === 0) return 4
    const gridWidth = containerWidth - SCROLL_PADDING * 2 - ROW_PADDING * 2
    return Math.max(1, Math.floor((gridWidth + GAP) / (MIN_COL + GAP)))
  }, [containerWidth])

  const virtualizer = useVirtualizer({
    count: grouped.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      if (containerWidth === 0) return 300
      const [, dateItems] = grouped[index]
      const gridWidth = containerWidth - SCROLL_PADDING * 2 - ROW_PADDING * 2
      const cols = Math.max(1, Math.floor((gridWidth + GAP) / (MIN_COL + GAP)))
      const cellWidth = (gridWidth - (cols - 1) * GAP) / cols
      const rows = Math.ceil(dateItems.length / cols)
      const gridHeight = rows * cellWidth + (rows - 1) * GAP
      // header (~28px) + mt-2 (8px) + gridHeight + p-3 top+bottom (24px)
      return 28 + 8 + gridHeight + ROW_PADDING * 2
    },
    overscan: 3,
    // 3. Use gap instead of mb-4 margin (margin not in border-box measurements)
    gap: 16,
    // 4. Stable measurement cache key per date group
    getItemKey: (index) => grouped[index][0],
  })

  // 5. Invalidate measurements on group composition change
  const groupFingerprint = useMemo(
    () => grouped.map(([date, grp]) => `${date}:${grp.length}`).join(','),
    [grouped],
  )

  useEffect(() => {
    virtualizer.measure()
  }, [groupFingerprint, virtualizer])

  // 6. Invalidate measurements on container width change
  useEffect(() => {
    if (containerWidth > 0) {
      virtualizer.measure()
    }
  }, [containerWidth, virtualizer])

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

  // Initial load skeleton
  if (items.length === 0 && loading) {
    return (
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-busy="true">
        <SkeletonGroup columns={4} rows={2} />
        <SkeletonGroup columns={4} rows={3} />
        <SkeletonGroup columns={4} rows={2} />
      </div>
    )
  }

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
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-text-soft">
          <span className="text-sm">
            {totals.total > 0
              ? `Syncing... ${totals.progress.toLocaleString()} / ${totals.total.toLocaleString()} items`
              : 'Syncing...'}
          </span>
          <div className="h-2 w-64 overflow-hidden rounded-full bg-surface-strong">
            <div
              className={`h-full rounded-full bg-accent transition-all duration-300${totals.total === 0 ? ' animate-pulse' : ''}`}
              style={{
                width: `${totals.total > 0 ? pct : 100}%`,
              }}
            />
          </div>
        </div>
      )
    }

    return <EmptyState />
  }
  // #endregion

  // #region Media grid
  return (
    <div
      ref={setScrollRef}
      className="flex-1 overflow-y-auto p-4 select-none"
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
              className="rounded-lg border border-border bg-surface/60 p-3"
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
                    role="checkbox"
                    aria-checked={allSelected}
                    aria-label="Select all items in this date group"
                    className={`flex h-4 w-4 items-center justify-center rounded border transition-colors${
                      allSelected
                        ? ' border-accent bg-accent text-white'
                        : ' border-text-soft bg-transparent'
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
                    priority={virtualRow.index === 0}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {hasMore && loading && (
        <div className="mt-4">
          <SkeletonGroup columns={skeletonCols} rows={2} />
        </div>
      )}
      {selectionRect && (
        <div
          className="pointer-events-none fixed z-40 border border-accent bg-accent/15"
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
