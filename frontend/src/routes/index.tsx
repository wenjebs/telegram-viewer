import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  getAuthStatus,
  startSyncAll,
  getSyncStatus,
  clearAllMedia,
} from '#/api/client'
import type { DateRange } from 'react-day-picker'
import type { MediaItem, SyncStatus } from '#/api/types'
import AuthFlow from '#/components/AuthFlow'
import Sidebar from '#/components/Sidebar'
import MediaGrid from '#/components/MediaGrid'
import Lightbox from '#/components/Lightbox'
import { useGroups } from '#/hooks/useGroups'
import { useMedia } from '#/hooks/useMedia'

export const Route = createFileRoute('/')({ component: Home })

const formatDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string | null>(null)
  const [chatTypeFilter, setChatTypeFilter] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [syncing, setSyncing] = useState(false)
  const [syncStatuses, setSyncStatuses] = useState<Record<number, SyncStatus>>(
    {},
  )
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { groups, toggleActive, activeGroupIds } = useGroups(
    authenticated === true,
  )
  const { items, loading, hasMore, fetchMedia, reset } = useMedia()

  const dateFrom = useMemo(
    () => (dateRange?.from ? formatDate(dateRange.from) : undefined),
    [dateRange?.from],
  )
  const dateTo = useMemo(
    () => (dateRange?.to ? formatDate(dateRange.to) : undefined),
    [dateRange?.to],
  )

  // Refs for values accessed inside setInterval (handleSync)
  const activeGroupIdsRef = useRef(activeGroupIds)
  activeGroupIdsRef.current = activeGroupIds
  const mediaTypeFilterRef = useRef(mediaTypeFilter)
  mediaTypeFilterRef.current = mediaTypeFilter
  const dateFromRef = useRef(dateFrom)
  dateFromRef.current = dateFrom
  const dateToRef = useRef(dateTo)
  dateToRef.current = dateTo

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  useEffect(() => {
    getAuthStatus()
      .then((s) => setAuthenticated(s.authenticated))
      .catch(() => setAuthenticated(false))
  }, [])

  useEffect(() => {
    if (!authenticated) return
    reset()
    fetchMedia({
      groups: activeGroupIds,
      type: mediaTypeFilter ?? undefined,
      dateFrom,
      dateTo,
      reset: true,
    })
  }, [
    authenticated,
    activeGroupIds,
    mediaTypeFilter,
    dateFrom,
    dateTo,
    reset,
    fetchMedia,
  ])

  const handleSync = async () => {
    if (activeGroupIds.length === 0) return
    setSyncing(true)
    try {
      await startSyncAll(activeGroupIds)
    } catch {
      setSyncing(false)
      return
    }

    stopPolling()
    pollRef.current = setInterval(async () => {
      const currentIds = activeGroupIdsRef.current
      const statuses: Record<number, SyncStatus> = {}
      await Promise.all(
        currentIds.map(async (gid) => {
          try {
            statuses[gid] = await getSyncStatus(gid)
          } catch {
            statuses[gid] = { status: 'error', progress: 0, total: 0 }
          }
        }),
      )
      setSyncStatuses(statuses)

      const allDone = currentIds.every(
        (gid) =>
          statuses[gid]?.status === 'done' || statuses[gid]?.status === 'error',
      )
      if (allDone) {
        stopPolling()
        setSyncing(false)
        reset()
        fetchMedia({
          groups: activeGroupIdsRef.current,
          type: mediaTypeFilterRef.current ?? undefined,
          dateFrom: dateFromRef.current,
          dateTo: dateToRef.current,
          reset: true,
        })
      }
    }, 2000)
  }

  const handleClear = async () => {
    try {
      await clearAllMedia()
      reset()
      fetchMedia({
        groups: activeGroupIds,
        type: mediaTypeFilter ?? undefined,
        dateFrom,
        dateTo,
        reset: true,
      })
    } catch {
      /* clearAllMedia failure is non-critical */
    }
  }

  const handleLoadMore = () => {
    fetchMedia({
      groups: activeGroupIds,
      type: mediaTypeFilter ?? undefined,
      dateFrom,
      dateTo,
    })
  }

  const selectedIndex = selectedItem
    ? items.findIndex((i) => i.id === selectedItem.id)
    : -1
  const handlePrev = () => {
    if (selectedIndex > 0) setSelectedItem(items[selectedIndex - 1])
  }
  const handleNext = () => {
    if (selectedIndex < items.length - 1)
      setSelectedItem(items[selectedIndex + 1])
  }

  if (authenticated === null) return null
  if (!authenticated)
    return <AuthFlow onAuthenticated={() => setAuthenticated(true)} />

  return (
    <div className="flex h-screen">
      <Sidebar
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
        groups={groups}
        onToggleGroup={toggleActive}
        mediaTypeFilter={mediaTypeFilter}
        onMediaTypeFilter={setMediaTypeFilter}
        chatTypeFilter={chatTypeFilter}
        onChatTypeFilter={setChatTypeFilter}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onSync={handleSync}
        onClear={handleClear}
        syncing={syncing}
        syncStatuses={syncStatuses}
      />
      <MediaGrid
        items={items}
        hasMore={hasMore}
        loading={loading}
        onLoadMore={handleLoadMore}
        onItemClick={setSelectedItem}
        syncing={syncing}
        syncStatuses={syncStatuses}
      />
      {selectedItem && (
        <Lightbox
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onPrev={handlePrev}
          onNext={handleNext}
          hasPrev={selectedIndex > 0}
          hasNext={selectedIndex < items.length - 1}
        />
      )}
    </div>
  )
}
