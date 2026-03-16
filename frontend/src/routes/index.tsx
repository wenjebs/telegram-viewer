import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  getAuthStatus,
  clearAllMedia,
  getHiddenCount,
  getFavoritesCount,
  hideDialog,
  unhideDialog,
  getHiddenDialogs,
  getHiddenDialogCount,
} from '#/api/client'
import type { DateRange } from 'react-day-picker'
import type { Group, MediaItem } from '#/api/types'
import AuthFlow from '#/components/AuthFlow'
import Sidebar from '#/components/Sidebar'
import MediaGrid from '#/components/MediaGrid'
import Lightbox from '#/components/Lightbox'
import SelectionBar from '#/components/SelectionBar'
import { useGroups } from '#/hooks/useGroups'
import { useMedia } from '#/hooks/useMedia'
import { useHiddenMedia } from '#/hooks/useHiddenMedia'
import { useFavoritesMedia } from '#/hooks/useFavoritesMedia'
import { useSelectMode } from '#/hooks/useSelectMode'
import { useDragSelect } from '#/hooks/useDragSelect'
import { useSyncPolling } from '#/hooks/useSyncPolling'
import { useLightbox } from '#/hooks/useLightbox'

export const Route = createFileRoute('/')({ component: Home })

type ViewMode = 'normal' | 'hidden' | 'favorites'

const formatDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function Home() {
  // #region State
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string | null>(null)
  const [chatTypeFilter, setChatTypeFilter] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [viewMode, setViewMode] = useState<ViewMode>('normal')
  const [hiddenCount, setHiddenCount] = useState(0)
  const [favoritesCount, setFavoritesCount] = useState(0)
  const [showHiddenDialogs, setShowHiddenDialogs] = useState(false)
  const [hiddenDialogs, setHiddenDialogs] = useState<Group[]>([])
  const [hiddenDialogCount, setHiddenDialogCount] = useState(0)
  // #endregion

  // #region Hooks
  const {
    groups,
    toggleActive,
    activeGroupIds,
    refetch: refetchGroups,
  } = useGroups(authenticated === true)
  const media = useMedia()
  const hidden = useHiddenMedia()
  const favorites = useFavoritesMedia()
  const selectMode = useSelectMode()
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const dragSelect = useDragSelect({
    containerRef: gridContainerRef,
    selectMode: selectMode.active,
    enterSelectMode: selectMode.enterSelectMode,
    setSelection: selectMode.setSelection,
    selectedIds: selectMode.selectedIds,
  })
  // #endregion

  // #region Derived state
  const activeSource =
    viewMode === 'hidden'
      ? hidden
      : viewMode === 'favorites'
        ? favorites
        : media
  const activeItems = useMemo(
    () =>
      [...activeSource.items].toSorted((a, b) => b.date.localeCompare(a.date)),
    [activeSource.items],
  )
  const activeLoading = activeSource.loading
  const activeHasMore = activeSource.hasMore
  // #endregion

  // #region Date filters
  const dateFrom = useMemo(
    () => (dateRange?.from ? formatDate(dateRange.from) : undefined),
    [dateRange?.from],
  )
  const dateTo = useMemo(
    () => (dateRange?.to ? formatDate(dateRange.to) : undefined),
    [dateRange?.to],
  )
  // #endregion

  // #region Refs for interval/callback access
  const activeGroupIdsRef = useRef(activeGroupIds)
  activeGroupIdsRef.current = activeGroupIds
  const mediaTypeFilterRef = useRef(mediaTypeFilter)
  mediaTypeFilterRef.current = mediaTypeFilter
  const dateFromRef = useRef(dateFrom)
  dateFromRef.current = dateFrom
  const dateToRef = useRef(dateTo)
  dateToRef.current = dateTo
  // #endregion

  // #region Counts
  const refreshCounts = useCallback(() => {
    getHiddenCount()
      .then((r) => setHiddenCount(r.count))
      .catch(() => {})
    getFavoritesCount()
      .then((r) => setFavoritesCount(r.count))
      .catch(() => {})
    getHiddenDialogCount()
      .then((r) => setHiddenDialogCount(r.count))
      .catch(() => {})
  }, [])
  // #endregion

  // #region Sync polling
  const onSyncComplete = useCallback(
    (params: {
      groups: number[]
      type?: string
      dateFrom?: string
      dateTo?: string
    }) => {
      media.reset()
      media.fetchMedia({ ...params, reset: true })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const { syncing, syncStatuses, handleSync } = useSyncPolling({
    activeGroupIdsRef,
    mediaTypeFilterRef,
    dateFromRef,
    dateToRef,
    onSyncComplete,
  })
  // #endregion

  // #region Lightbox
  const lightbox = useLightbox({
    activeItems,
    media,
    hidden,
    selectMode,
    refreshCounts,
    viewMode,
  })
  // #endregion

  // #region Effects
  useEffect(() => {
    getAuthStatus()
      .then((s) => setAuthenticated(s.authenticated))
      .catch(() => setAuthenticated(false))
  }, [])

  useEffect(() => {
    if (authenticated) refreshCounts()
  }, [authenticated, refreshCounts])

  useEffect(() => {
    if (!authenticated) return
    media.reset()
    media.fetchMedia({
      groups: activeGroupIds,
      type: mediaTypeFilter ?? undefined,
      dateFrom,
      dateTo,
      reset: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    activeGroupIds,
    mediaTypeFilter,
    dateFrom,
    dateTo,
    media.reset,
    media.fetchMedia,
  ])

  useEffect(() => {
    if (viewMode === 'hidden' && authenticated) {
      hidden.reset()
      hidden.fetchHidden({ reset: true })
    }
    if (viewMode === 'favorites' && authenticated) {
      favorites.reset()
      favorites.fetchFavorites({ reset: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewMode,
    authenticated,
    hidden.reset,
    hidden.fetchHidden,
    favorites.reset,
    favorites.fetchFavorites,
  ])

  // Escape key — use refs to avoid re-attaching on every render
  const selectModeRef = useRef(selectMode)
  selectModeRef.current = selectMode

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        selectModeRef.current.active &&
        !lightbox.selectedItem &&
        !lightbox.justClosedLightboxRef.current
      ) {
        selectModeRef.current.exitSelectMode()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox.selectedItem])
  // #endregion

  // #region Handlers
  const handleClear = async () => {
    try {
      await clearAllMedia()
      media.reset()
      media.fetchMedia({
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
    if (viewMode === 'hidden') {
      hidden.fetchHidden({})
    } else if (viewMode === 'favorites') {
      favorites.fetchFavorites({})
    } else {
      media.fetchMedia({
        groups: activeGroupIds,
        type: mediaTypeFilter ?? undefined,
        dateFrom,
        dateTo,
      })
    }
  }

  const handleItemClick = (item: MediaItem) => {
    if (selectMode.active) return
    lightbox.setSelectedItem(item)
  }

  const handleToggle = (id: number, event: React.MouseEvent) => {
    if (event.shiftKey) {
      selectMode.toggleRange(id, activeItems)
    } else {
      selectMode.toggle(id)
    }
  }

  const handleLongPress = (item: MediaItem) => {
    if (!selectMode.active) {
      selectMode.enterSelectMode(item.id)
    }
  }

  const handleViewModeChange = (mode: ViewMode) => {
    selectMode.exitSelectMode()
    lightbox.setSelectedItem(null)
    setViewMode(mode)
  }

  const handleHideDialog = async (group: Group) => {
    try {
      await hideDialog(group.id)
    } catch {
      return
    }
    refetchGroups()
    media.reset()
    media.fetchMedia({
      groups: activeGroupIds.filter((id) => id !== group.id),
      type: mediaTypeFilter ?? undefined,
      dateFrom,
      dateTo,
      reset: true,
    })
    refreshCounts()
  }

  const handleUnhideDialog = async (group: Group) => {
    try {
      await unhideDialog(group.id)
    } catch {
      return
    }
    setHiddenDialogs((prev) => prev.filter((g) => g.id !== group.id))
    setHiddenDialogCount((prev) => Math.max(0, prev - 1))
    refetchGroups()
  }

  const handleToggleHiddenDialogs = async () => {
    const next = !showHiddenDialogs
    setShowHiddenDialogs(next)
    if (next) {
      try {
        const dialogs = await getHiddenDialogs()
        setHiddenDialogs(dialogs)
      } catch {
        setHiddenDialogs([])
      }
    }
  }
  // #endregion

  // #region Render
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
        onSync={() => handleSync(activeGroupIds)}
        onClear={handleClear}
        syncing={syncing}
        syncStatuses={syncStatuses}
        selectMode={selectMode.active}
        onEnterSelectMode={() => selectMode.enterSelectMode()}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        hiddenCount={hiddenCount}
        favoritesCount={favoritesCount}
        showHiddenDialogs={showHiddenDialogs}
        onToggleHiddenDialogs={handleToggleHiddenDialogs}
        hiddenDialogs={hiddenDialogs}
        onHideDialog={handleHideDialog}
        onUnhideDialog={handleUnhideDialog}
        hiddenDialogCount={hiddenDialogCount}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {groups.some((g) => g.active) && (
          <div className="flex justify-center border-b border-neutral-800 bg-neutral-900/80 px-4 py-2 backdrop-blur-sm">
            <div className="flex flex-wrap justify-center gap-1">
              {groups
                .filter((g) => g.active)
                .map((g) => (
                  <button
                    key={g.id}
                    className="flex items-center gap-1 rounded-full bg-sky-600/20 px-2 py-0.5 text-xs text-sky-300 hover:bg-sky-600/30"
                    onClick={() => toggleActive(g)}
                  >
                    <span className="max-w-28 truncate">{g.name}</span>
                    <span className="text-sky-400/60 hover:text-sky-300">
                      ✕
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
        <MediaGrid
          items={activeItems}
          hasMore={activeHasMore}
          loading={activeLoading}
          onLoadMore={handleLoadMore}
          onItemClick={handleItemClick}
          syncing={viewMode === 'normal' ? syncing : false}
          syncStatuses={syncStatuses}
          selectMode={selectMode.active}
          selectedIds={selectMode.selectedIds}
          onToggle={handleToggle}
          onSelectDateGroup={selectMode.selectDateGroup}
          onLongPress={handleLongPress}
          containerRef={gridContainerRef}
          dragHandlers={dragSelect.handlers}
          selectionRect={dragSelect.selectionRect}
        />
      </div>
      {lightbox.selectedItem && (
        <Lightbox
          item={lightbox.selectedItem}
          onClose={lightbox.handleClose}
          onPrev={lightbox.handlePrev}
          onNext={lightbox.handleNext}
          hasPrev={lightbox.selectedIndex > 0}
          hasNext={lightbox.selectedIndex < activeItems.length - 1}
          selected={selectMode.isSelected(lightbox.selectedItem.id)}
          favorited={!!lightbox.selectedItem.favorited_at}
          onToggleSelect={lightbox.handleToggleSelect}
          onHide={lightbox.handleHide}
          onUnhide={lightbox.handleUnhide}
          onToggleFavorite={lightbox.handleToggleFavorite}
        />
      )}
      {selectMode.active && (
        <SelectionBar
          selectedCount={selectMode.selectedCount}
          onSelectAll={() => selectMode.selectAll(activeItems)}
          onDeselectAll={selectMode.deselectAll}
          onDownload={selectMode.exitSelectMode}
          onCancel={selectMode.exitSelectMode}
          selectedIds={selectMode.selectedIds}
          viewMode={viewMode}
          onUnhide={() => {
            hidden.removeItems([...selectMode.selectedIds])
            selectMode.exitSelectMode()
            refreshCounts()
          }}
          onHide={() => {
            const ids = [...selectMode.selectedIds]
            media.removeItems(ids)
            selectMode.exitSelectMode()
            refreshCounts()
          }}
          onFavorite={() => {
            selectMode.exitSelectMode()
            refreshCounts()
          }}
        />
      )}
    </div>
  )
}
