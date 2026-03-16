import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import type { Group, MediaItem, Person } from '#/api/schemas'
import AuthFlow from '#/components/AuthFlow'
import Sidebar from '#/components/Sidebar'
import MediaGrid from '#/components/MediaGrid'
import Lightbox from '#/components/Lightbox'
import SelectionBar from '#/components/SelectionBar'
import { useGroups } from '#/hooks/useGroups'
import { useMedia } from '#/hooks/useMedia'
import type { MediaFilters } from '#/hooks/useMedia'
import { useHiddenMedia } from '#/hooks/useHiddenMedia'
import { useFavoritesMedia } from '#/hooks/useFavoritesMedia'
import { useSelectMode } from '#/hooks/useSelectMode'
import { useDragSelect } from '#/hooks/useDragSelect'
import { useSyncStatus } from '#/hooks/useSyncStatus'
import { useLightbox } from '#/hooks/useLightbox'
import { usePrefetch } from '#/hooks/usePrefetch'
import { useFaceScan } from '#/hooks/useFaceScan'
import { usePersons } from '#/hooks/usePersons'
import { usePersonMedia } from '#/hooks/usePersonMedia'
import { renamePerson, mergePersons } from '#/api/client'
import PeopleGrid from '#/components/PeopleGrid'
import PersonDetail from '#/components/PersonDetail'
import PersonMergeModal from '#/components/PersonMergeModal'
import { formatDateParam } from '#/utils/format'

export const Route = createFileRoute('/')({ component: Home })

type ViewMode = 'normal' | 'hidden' | 'favorites' | 'people'

function Home() {
  const queryClient = useQueryClient()

  // #region State
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string | null>(null)
  const [chatTypeFilter, setChatTypeFilter] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [viewMode, setViewMode] = useState<ViewMode>('normal')
  const [hiddenCount, setHiddenCount] = useState(0)
  const [favoritesCount, setFavoritesCount] = useState(0)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [showHiddenDialogs, setShowHiddenDialogs] = useState(false)
  const [hiddenDialogs, setHiddenDialogs] = useState<Group[]>([])
  const [hiddenDialogCount, setHiddenDialogCount] = useState(0)
  // #endregion

  // #region Date filters
  const dateFrom = useMemo(
    () => (dateRange?.from ? formatDateParam(dateRange.from) : undefined),
    [dateRange?.from],
  )
  const dateTo = useMemo(
    () => (dateRange?.to ? formatDateParam(dateRange.to) : undefined),
    [dateRange?.to],
  )
  // #endregion

  // #region Hooks
  const {
    groups,
    toggleActive,
    activeGroupIds,
    displayGroupIds,
    displayFilteredGroupIds,
    toggleDisplayFilter,
    clearDisplayFilter,
    refetch: refetchGroups,
  } = useGroups(authenticated === true)

  const mediaFilters: MediaFilters = useMemo(
    () => ({
      groups: displayFilteredGroupIds,
      type: mediaTypeFilter ?? undefined,
      dateFrom,
      dateTo,
    }),
    [displayFilteredGroupIds, mediaTypeFilter, dateFrom, dateTo],
  )

  const media = useMedia(mediaFilters, authenticated === true)
  const hidden = useHiddenMedia(viewMode === 'hidden' && authenticated === true)
  const favorites = useFavoritesMedia(
    viewMode === 'favorites' && authenticated === true,
  )
  const persons = usePersons(viewMode === 'people' && authenticated === true)
  const personMedia = usePersonMedia(
    selectedPerson?.id ?? null,
    viewMode === 'people' && selectedPerson != null && authenticated === true,
  )
  const faceScan = useFaceScan({
    onScanComplete: () => persons.invalidate(),
  })
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
        : viewMode === 'people' && selectedPerson
          ? personMedia
          : media
  const activeItems = useMemo(
    () =>
      [...activeSource.items].toSorted((a, b) => b.date.localeCompare(a.date)),
    [activeSource.items],
  )
  const activeLoading = activeSource.loading
  const activeHasMore = activeSource.hasMore
  // #endregion

  usePrefetch(activeItems, authenticated === true)

  // #region Counts
  const refreshCounts = useCallback(() => {
    getHiddenCount()
      .then((r) => setHiddenCount(r.count))
      .catch(() => toast.error('Failed to fetch hidden count'))
    getFavoritesCount()
      .then((r) => setFavoritesCount(r.count))
      .catch(() => toast.error('Failed to fetch favorites count'))
    getHiddenDialogCount()
      .then((r) => setHiddenDialogCount(r.count))
      .catch(() => toast.error('Failed to fetch hidden dialog count'))
  }, [])
  // #endregion

  // #region Sync polling
  const onSyncComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['media'] })
  }, [queryClient])

  const { syncing, syncStatuses, handleSync } = useSyncStatus({
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

  // Escape key
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
      queryClient.invalidateQueries({ queryKey: ['media'] })
      toast.success('All media cleared')
    } catch {
      toast.error('Failed to clear media')
    }
  }

  const handleLoadMore = () => {
    activeSource.fetchNextPage()
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
    setSelectedPerson(null)
    setViewMode(mode)
  }

  const handleHideDialog = async (group: Group) => {
    try {
      await hideDialog(group.id)
    } catch {
      toast.error('Failed to hide dialog')
      return
    }
    toast.success(`${group.name} hidden`)
    refetchGroups()
    queryClient.invalidateQueries({ queryKey: ['media'] })
    refreshCounts()
  }

  const handleUnhideDialog = async (group: Group) => {
    try {
      await unhideDialog(group.id)
    } catch {
      toast.error('Failed to unhide dialog')
      return
    }
    toast.success(`${group.name} unhidden`)
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
        toast.error('Failed to load hidden dialogs')
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
        displayGroupIds={displayGroupIds}
        onToggleDisplayFilter={toggleDisplayFilter}
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
        personCount={faceScan.status.person_count}
        faceScanning={faceScan.scanning}
        faceScanScanned={faceScan.status.scanned}
        faceScanTotal={faceScan.status.total}
        onStartFaceScan={() => faceScan.startScan(false)}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {activeGroupIds.length > 0 && (
          <div className="flex items-center justify-center gap-2 border-b border-neutral-800 bg-neutral-900/80 px-4 py-2 backdrop-blur-sm">
            <span className="shrink-0 text-xs text-neutral-500">Syncing:</span>
            <div className="flex flex-wrap justify-center gap-1">
              {groups
                .filter((g) => g.active)
                .map((g) => (
                  <button
                    key={g.id}
                    className="flex items-center gap-1 rounded-full bg-emerald-600/20 px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-600/30"
                    onClick={() => toggleActive(g)}
                  >
                    <span className="max-w-28 truncate">{g.name}</span>
                    <span className="text-emerald-400/60 hover:text-emerald-300">
                      ✕
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
        {displayGroupIds.size > 0 && (
          <div className="flex items-center justify-center gap-2 border-b border-neutral-800 bg-neutral-900/80 px-4 py-2 backdrop-blur-sm">
            <span className="shrink-0 text-xs text-neutral-500">
              Showing only:
            </span>
            <div className="flex flex-wrap justify-center gap-1">
              {groups
                .filter((g) => displayGroupIds.has(g.id))
                .map((g) => (
                  <button
                    key={g.id}
                    className="flex items-center gap-1 rounded-full bg-sky-600/20 px-2 py-0.5 text-xs text-sky-300 hover:bg-sky-600/30"
                    onClick={() => toggleDisplayFilter(g.id)}
                  >
                    <span className="max-w-28 truncate">{g.name}</span>
                    <span className="text-sky-400/60 hover:text-sky-300">
                      ✕
                    </span>
                  </button>
                ))}
            </div>
            <button
              className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300"
              onClick={clearDisplayFilter}
            >
              Show all
            </button>
          </div>
        )}
        {viewMode === 'people' && !selectedPerson ? (
          <PeopleGrid
            persons={persons.persons}
            loading={persons.loading}
            onPersonClick={setSelectedPerson}
          />
        ) : (
          <>
            {viewMode === 'people' && selectedPerson && (
              <PersonDetail
                key={selectedPerson.id}
                person={selectedPerson}
                onBack={() => setSelectedPerson(null)}
                onRename={async (name) => {
                  try {
                    await renamePerson(selectedPerson.id, name)
                    setSelectedPerson({
                      ...selectedPerson,
                      name,
                      display_name: name,
                    })
                    persons.invalidate()
                  } catch {
                    toast.error('Failed to rename person')
                  }
                }}
                onMerge={() => setShowMergeModal(true)}
              />
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
          </>
        )}
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
      {showMergeModal && selectedPerson && (
        <PersonMergeModal
          persons={persons.persons}
          currentPersonId={selectedPerson.id}
          onMerge={async (mergeId) => {
            try {
              await mergePersons(selectedPerson.id, mergeId)
              setShowMergeModal(false)
              persons.invalidate()
              queryClient.invalidateQueries({
                queryKey: ['faces', 'persons', selectedPerson.id, 'media'],
              })
            } catch {
              toast.error('Failed to merge persons')
            }
          }}
          onClose={() => setShowMergeModal(false)}
        />
      )}
    </div>
  )
}
