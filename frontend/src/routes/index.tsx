import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
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
  getMediaCount,
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
import KeepPersonPicker from '#/components/KeepPersonPicker'
import ShortcutsModal from '#/components/ShortcutsModal'
import { usePersonMerge } from '#/hooks/usePersonMerge'
import { formatDateParam } from '#/utils/format'
import { useSearchParams } from '#/hooks/useSearchParam'

type ViewMode = 'normal' | 'hidden' | 'favorites' | 'people'

const searchSchema = z.object({
  mode: z
    .enum(['normal', 'hidden', 'favorites', 'people'])
    .optional()
    .catch(undefined),
  person: z.coerce.number().optional().catch(undefined),
  item: z.coerce.number().optional().catch(undefined),
  media: z.enum(['photo', 'video']).optional().catch(undefined),
  chat: z.enum(['dm', 'group', 'channel']).optional().catch(undefined),
  faces: z.enum(['none', 'solo', 'group']).optional().catch(undefined),
  sync: z.enum(['synced', 'unsynced']).optional().catch(undefined),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  q: z.string().optional().catch(undefined),
  hiddenDialogs: z
    .union([z.literal('1'), z.literal('true'), z.literal(true)])
    .transform(() => true as const)
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute('/')({
  component: Home,
  validateSearch: (raw) => searchSchema.parse(raw),
})

function Home() {
  const queryClient = useQueryClient()

  // #region URL state
  const { search, setSearch } = useSearchParams()
  const viewMode: ViewMode = search.mode ?? 'normal'
  const mediaTypeFilter = search.media ?? null
  const chatTypeFilter = search.chat ?? null
  const syncFilter = search.sync ?? null
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
  const showHiddenDialogs = search.hiddenDialogs ?? false
  // #endregion

  // #region Local state (not URL-worthy)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [hiddenDialogs, setHiddenDialogs] = useState<Group[]>([])
  const { data: hiddenCount = 0 } = useQuery({
    queryKey: ['counts', 'hidden'],
    queryFn: () => getHiddenCount().then((r) => r.count),
    enabled: authenticated === true,
  })
  const { data: favoritesCount = 0 } = useQuery({
    queryKey: ['counts', 'favorites'],
    queryFn: () => getFavoritesCount().then((r) => r.count),
    enabled: authenticated === true,
  })
  const { data: totalCount = 0 } = useQuery({
    queryKey: ['counts', 'total'],
    queryFn: () => getMediaCount().then((r) => r.count),
    enabled: authenticated === true,
  })
  const { data: hiddenDialogCount = 0 } = useQuery({
    queryKey: ['counts', 'hiddenDialogs'],
    queryFn: () => getHiddenDialogCount().then((r) => r.count),
    enabled: authenticated === true,
  })
  const [similarityThreshold, setSimilarityThreshold] = useState(0.4)
  // #endregion

  // #region URL state helpers
  const setMediaTypeFilter = useCallback(
    (v: string | null) =>
      setSearch(
        { media: (v as 'photo' | 'video') ?? undefined },
        { replace: true },
      ),
    [setSearch],
  )
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
  const setSelectedPersonId = useCallback(
    (id: number | undefined) => setSearch({ person: id }),
    [setSearch],
  )
  const setShowHiddenDialogs = useCallback(
    (v: boolean) =>
      setSearch({ hiddenDialogs: v ? true : undefined }, { replace: true }),
    [setSearch],
  )
  // #endregion

  // #region Hooks
  const {
    groups,
    toggleActive,
    unsyncGroup,
    activeGroupIds,
    refetch: refetchGroups,
    previewCounts,
  } = useGroups({
    enabled: authenticated === true,
  })

  const facesFilter = search.faces ?? null
  const mediaFilters: MediaFilters = useMemo(
    () => ({
      groups: activeGroupIds,
      type: mediaTypeFilter ?? undefined,
      dateFrom,
      dateTo,
      faces: facesFilter ?? undefined,
    }),
    [activeGroupIds, mediaTypeFilter, dateFrom, dateTo, facesFilter],
  )

  const media = useMedia(mediaFilters, authenticated === true)
  const hidden = useHiddenMedia(viewMode === 'hidden' && authenticated === true)
  const favorites = useFavoritesMedia(
    viewMode === 'favorites' && authenticated === true,
  )
  const persons = usePersons(
    viewMode === 'people' && authenticated === true,
    similarityThreshold,
  )
  const personMerge = usePersonMerge(() => persons.invalidate())
  const selectedPerson = useMemo(
    () =>
      search.person
        ? (persons.persons.find((p) => p.id === search.person) ?? null)
        : null,
    [search.person, persons.persons],
  )
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
  const peopleContainerRef = useRef<HTMLDivElement>(null)
  const peopleDragSelect = useDragSelect({
    containerRef: peopleContainerRef,
    selectMode: personMerge.selectMode.active,
    enterSelectMode: personMerge.selectMode.enterSelectMode,
    setSelection: personMerge.selectMode.setSelection,
    selectedIds: personMerge.selectMode.selectedIds,
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
  const invalidateCounts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['counts'] }),
    [queryClient],
  )
  const invalidateActiveMedia = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['media'] })
    if (selectedPerson) {
      queryClient.invalidateQueries({
        queryKey: ['faces', 'persons', selectedPerson.id, 'media'],
      })
    }
  }, [queryClient, selectedPerson])
  // #endregion

  // #region Sync polling
  const onSyncComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['media'] })
    queryClient.invalidateQueries({ queryKey: ['preview-counts'] })
    invalidateCounts()
  }, [queryClient, invalidateCounts])

  const { syncing, syncStatuses, handleSync } = useSyncStatus({
    onSyncComplete,
  })
  // #endregion

  // #region Lightbox
  const lightboxItem = useMemo(
    () =>
      search.item
        ? (activeItems.find((i) => i.id === search.item) ?? null)
        : null,
    [search.item, activeItems],
  )
  const setLightboxItem = useCallback(
    (item: MediaItem | null) => {
      if (item) {
        // Opening or navigating: use replace for prev/next
        setSearch({ item: item.id }, { replace: !!search.item })
      } else {
        // Closing: use replace to avoid push loop
        setSearch({ item: undefined }, { replace: true })
      }
    },
    [setSearch, search.item],
  )
  const lightbox = useLightbox({
    activeItems,
    selectedItem: lightboxItem,
    setSelectedItem: setLightboxItem,
    media: selectedPerson ? personMedia : media,
    hidden,
    selectMode,
    refreshCounts: invalidateCounts,
    invalidateMedia: invalidateActiveMedia,
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
    if (authenticated) invalidateCounts()
  }, [authenticated, invalidateCounts])

  // Auto-set mode=people when person is in URL but mode isn't
  useEffect(() => {
    if (search.person && viewMode !== 'people') {
      setSearch({ mode: 'people' }, { replace: true })
    }
  }, [search.person, viewMode, setSearch])

  // Fetch hidden dialogs when URL says hiddenDialogs=1 on load
  useEffect(() => {
    if (showHiddenDialogs && hiddenDialogs.length === 0) {
      getHiddenDialogs()
        .then(setHiddenDialogs)
        .catch(() => {
          toast.error('Failed to load hidden dialogs')
          setHiddenDialogs([])
        })
    }
  }, [showHiddenDialogs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key
  useHotkeys(
    'escape',
    () => {
      if (
        personMerge.selectMode.active &&
        !lightbox.selectedItem &&
        !lightbox.justClosedLightboxRef.current
      ) {
        personMerge.selectMode.exitSelectMode()
        return
      }
      if (
        selectMode.active &&
        !lightbox.selectedItem &&
        !lightbox.justClosedLightboxRef.current
      ) {
        selectMode.exitSelectMode()
      }
    },
    [selectMode.active, personMerge.selectMode.active, lightbox.selectedItem],
  )

  useHotkeys('shift+slash', () => setShowShortcuts(true))

  // #endregion

  // #region Handlers
  const handleClear = async () => {
    if (
      !window.confirm(
        'This will clear everything — faces, downloaded photos, and cache. This is a full reset. Continue?',
      )
    )
      return
    try {
      await clearAllMedia()
      queryClient.invalidateQueries({ queryKey: ['media'] })
      queryClient.invalidateQueries({ queryKey: ['faces'] })
      invalidateCounts()
      setSearch({ person: undefined, mode: undefined })
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
    personMerge.selectMode.exitSelectMode()
    lightbox.setSelectedItem(null)
    setSearch({
      mode: mode === 'normal' ? undefined : mode,
      person: undefined,
    })
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
    invalidateCounts()
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
    refetchGroups()
    queryClient.invalidateQueries({ queryKey: ['media'] })
    invalidateCounts()
  }

  const handleUnsyncGroup = async (group: Group) => {
    try {
      await unsyncGroup(group.id)
    } catch {
      toast.error('Failed to unsync group')
      return
    }
    toast.success(`${group.name} unsynced`)
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

  // Navigation shortcuts (only when lightbox is closed)
  useHotkeys('p', () => !lightboxItem && handleViewModeChange('people'), [
    lightboxItem,
  ])
  useHotkeys('m', () => !lightboxItem && handleViewModeChange('normal'), [
    lightboxItem,
  ])
  useHotkeys('f', () => !lightboxItem && handleViewModeChange('favorites'), [
    lightboxItem,
  ])
  useHotkeys(
    'h',
    () => {
      if (lightboxItem || selectMode.active) return
      handleViewModeChange(viewMode === 'hidden' ? 'normal' : 'hidden')
    },
    [lightboxItem, selectMode.active, viewMode],
  )
  useHotkeys('shift+h', () => !lightboxItem && handleToggleHiddenDialogs(), [
    lightboxItem,
    handleToggleHiddenDialogs,
  ])

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
        syncFilter={syncFilter}
        onSyncFilter={setSyncFilter}
        facesFilter={facesFilter}
        onFacesFilter={(v) =>
          setSearch(
            { faces: (v as 'none' | 'solo' | 'group') ?? undefined },
            { replace: true },
          )
        }
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
        onUnsyncGroup={handleUnsyncGroup}
        hiddenDialogCount={hiddenDialogCount}
        personCount={faceScan.status.person_count}
        faceScanning={faceScan.scanning}
        faceScanScanned={faceScan.status.scanned}
        faceScanTotal={faceScan.status.total}
        onStartFaceScan={() => faceScan.startScan(false)}
        totalCount={totalCount}
        previewCounts={previewCounts}
        initialSearchQuery={search.q ?? ''}
        onSearchQueryChange={(q) =>
          setSearch({ q: q || undefined }, { replace: true })
        }
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {viewMode !== 'normal' && (
          <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
            {viewMode === 'hidden' && (
              <svg
                className="h-4 w-4 text-text-soft"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                <circle cx="8" cy="8" r="2" />
                <line x1="2" y1="14" x2="14" y2="2" />
              </svg>
            )}
            {viewMode === 'favorites' && (
              <span className="text-sm text-text-soft">♥</span>
            )}
            {viewMode === 'people' && !selectedPerson && (
              <svg
                className="h-4 w-4 text-text-soft"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="5.5" cy="5" r="2.5" />
                <circle cx="10.5" cy="5" r="2.5" />
                <path d="M1 14c0-2.2 1.8-4 4-4h.5M15 14c0-2.2-1.8-4-4-4h-.5" />
              </svg>
            )}
            {viewMode === 'people' && selectedPerson && (
              <svg
                className="h-4 w-4 text-text-soft"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="8" cy="5" r="3" />
                <path d="M2 15c0-3 2.7-5 6-5s6 2 6 5" />
              </svg>
            )}
            <span className="flex-1 text-sm font-medium text-text">
              {viewMode === 'hidden' && 'Hidden Media'}
              {viewMode === 'favorites' && 'Favorites'}
              {viewMode === 'people' && !selectedPerson && 'People'}
              {viewMode === 'people' && selectedPerson && selectedPerson.name}
            </span>
            {viewMode === 'people' && !selectedPerson && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-soft">Similarity</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={similarityThreshold}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (v >= 0 && v <= 1) setSimilarityThreshold(v)
                  }}
                  className="w-14 rounded bg-surface-alt px-1.5 py-0.5 text-xs text-text outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}
            {viewMode === 'people' &&
              !selectedPerson &&
              !personMerge.selectMode.active && (
                <button
                  className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
                  onClick={() => personMerge.selectMode.enterSelectMode()}
                >
                  Select
                </button>
              )}
            <button
              className="rounded p-1 text-text-soft hover:bg-hover hover:text-text"
              onClick={() => {
                if (personMerge.selectMode.active) {
                  personMerge.selectMode.exitSelectMode()
                } else {
                  setSearch({ mode: undefined, person: undefined })
                }
              }}
              title={
                personMerge.selectMode.active
                  ? 'Exit select mode'
                  : 'Back to gallery'
              }
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        )}
        {activeGroupIds.length > 0 && (
          <div className="flex items-center justify-center gap-2 border-b border-border bg-surface/80 px-4 py-2 backdrop-blur-sm">
            <span className="shrink-0 text-xs text-text-soft">Syncing:</span>
            <div className="flex flex-wrap justify-center gap-1">
              {groups
                .filter((g) => g.active)
                .map((g) => (
                  <button
                    key={g.id}
                    className="flex items-center gap-1 rounded-full bg-emerald-600/20 px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-600/30"
                    onClick={() => toggleActive(g)}
                    title="Click to deactivate"
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
        {viewMode === 'people' && !selectedPerson ? (
          <PeopleGrid
            persons={persons.persons}
            loading={persons.loading}
            onPersonClick={(p: Person) => {
              personMerge.selectMode.exitSelectMode()
              setSelectedPersonId(p.id)
            }}
            selectMode={personMerge.selectMode.active}
            selectedIds={personMerge.selectMode.selectedIds}
            onToggle={personMerge.selectMode.toggle}
            similarGroups={persons.similarGroups}
            onSelectGroup={(ids) => {
              if (!personMerge.selectMode.active) {
                personMerge.selectMode.enterSelectMode()
              }
              personMerge.selectMode.setSelection(new Set(ids))
            }}
            onRename={async (id, name) => {
              try {
                await renamePerson(id, name)
                persons.invalidate()
              } catch {
                toast.error('Failed to rename person')
              }
            }}
            containerRef={peopleContainerRef}
            dragHandlers={peopleDragSelect.handlers}
            selectionRect={peopleDragSelect.selectionRect}
          />
        ) : (
          <>
            {viewMode === 'people' && selectedPerson && (
              <PersonDetail
                key={selectedPerson.id}
                person={selectedPerson}
                onBack={() => setSelectedPersonId(undefined)}
                onRename={async (name) => {
                  try {
                    await renamePerson(selectedPerson.id, name)
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
            invalidateCounts()
            invalidateActiveMedia()
          }}
          onHide={() => {
            const ids = [...selectMode.selectedIds]
            activeSource.removeItems(ids)
            selectMode.exitSelectMode()
            invalidateCounts()
            invalidateActiveMedia()
          }}
          onFavorite={() => {
            selectMode.exitSelectMode()
            invalidateCounts()
            invalidateActiveMedia()
          }}
          onUnfavorite={() => {
            favorites.removeItems([...selectMode.selectedIds])
            selectMode.exitSelectMode()
            invalidateCounts()
            invalidateActiveMedia()
          }}
        />
      )}
      {personMerge.selectMode.active && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 border-t border-border bg-surface px-4 py-2">
          <span className="text-sm text-text">
            {personMerge.selectMode.selectedCount} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
              onClick={() => personMerge.selectMode.selectAll(persons.persons)}
            >
              Select All
            </button>
            <button
              className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
              onClick={personMerge.selectMode.deselectAll}
            >
              Deselect
            </button>
            <button
              className="rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-40"
              disabled={
                personMerge.selectMode.selectedCount < 2 || personMerge.merging
              }
              onClick={personMerge.openKeeperPicker}
            >
              {personMerge.merging ? 'Merging...' : 'Merge'}
            </button>
            <button
              className="rounded p-1 text-text-soft hover:bg-hover hover:text-text"
              onClick={personMerge.selectMode.exitSelectMode}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>
      )}
      {personMerge.showKeeperPicker && (
        <KeepPersonPicker
          persons={persons.persons.filter((p) =>
            personMerge.selectMode.selectedIds.has(p.id),
          )}
          onSelect={personMerge.executeMerge}
          onClose={personMerge.closeKeeperPicker}
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
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  )
}
