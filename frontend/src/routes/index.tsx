import { lazy, Suspense, useRef, useCallback, useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  renamePerson,
  deletePerson,
  mergePersons,
  getMediaIds,
  getHiddenMediaIds,
  getFavoritesMediaIds,
  getPersonMediaIds,
  getCrossPersonConflicts,
  hideMediaBatch,
} from '#/api/client'
import type { MediaItem, Person, ConflictsResponse } from '#/api/schemas'
import { useSearchParams } from '#/hooks/useSearchParam'
import { useAppStore } from '#/stores/appStore'
import { useHomeData } from '#/hooks/useHomeData'
import { useHomeHandlers } from '#/hooks/useHomeHandlers'
import { useHomeShortcuts } from '#/hooks/useHomeShortcuts'
import { useDragSelect } from '#/hooks/useDragSelect'
import { searchSchema } from '#/routes/-searchSchema'
import Fuse from 'fuse.js'
import Sidebar from '#/components/Sidebar'
import ViewModeTabs from '#/components/ViewModeTabs'
import MediaGrid from '#/components/MediaGrid'
import ActiveGroupChips from '#/components/ActiveGroupChips'
import ViewModeHeader from '#/components/ViewModeHeader'
import PersonBreadcrumb from '#/components/PersonBreadcrumb'
import MediaToolbar from '#/components/MediaToolbar'
import PeopleToolbar from '#/components/PeopleToolbar'
import PersonMergeBar from '#/components/PersonMergeBar'

const AuthFlow = lazy(() => import('#/components/AuthFlow'))
const Lightbox = lazy(() => import('#/components/Lightbox'))
const SelectionBar = lazy(() => import('#/components/SelectionBar'))
const PeopleGrid = lazy(() => import('#/components/PeopleGrid'))
const PersonDetail = lazy(() => import('#/components/PersonDetail'))
const PersonMergeModal = lazy(() => import('#/components/PersonMergeModal'))
const KeepPersonPicker = lazy(() => import('#/components/KeepPersonPicker'))
const ShortcutsModal = lazy(() => import('#/components/ShortcutsModal'))
const PhotoContextMenu = lazy(() => import('#/components/PhotoContextMenu'))
const CrossPersonWarningModal = lazy(
  () => import('#/components/CrossPersonWarningModal'),
)

export const Route = createFileRoute('/')({
  component: Home,
  validateSearch: (raw) => searchSchema.parse(raw),
})

function Home() {
  const queryClient = useQueryClient()
  const { setSearch } = useSearchParams()
  const showMergeModal = useAppStore((s) => s.showMergeModal)
  const setShowMergeModal = useAppStore((s) => s.setShowMergeModal)
  const showShortcuts = useAppStore((s) => s.showShortcuts)
  const setShowShortcuts = useAppStore((s) => s.setShowShortcuts)
  const similarityThreshold = useAppStore((s) => s.similarityThreshold)
  const setSimilarityThreshold = useAppStore((s) => s.setSimilarityThreshold)

  const [peopleSearchQuery, setPeopleSearchQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    mediaId: number
  } | null>(null)
  const [conflicts, setConflicts] = useState<
    ConflictsResponse['conflicts'] | null
  >(null)
  const [pendingHideIds, setPendingHideIds] = useState<number[]>([])

  const data = useHomeData()

  const peopleFuse = useMemo(
    () =>
      new Fuse(data.persons.persons, {
        keys: ['display_name'],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 1,
      }),
    [data.persons.persons],
  )

  const filteredPersons = useMemo(
    () =>
      !peopleSearchQuery.trim()
        ? data.persons.persons
        : peopleFuse.search(peopleSearchQuery).map((r) => r.item),
    [peopleFuse, peopleSearchQuery, data.persons.persons],
  )

  const handlers = useHomeHandlers({
    invalidateCounts: data.invalidateCounts,
    refetchGroups: data.refetchGroups,
    unsyncGroup: data.unsyncGroup,
    selectMode: data.selectMode,
    personMerge: data.personMerge,
    lightbox: data.lightbox,
    showHiddenDialogs: data.showHiddenDialogs,
    setShowHiddenDialogs: data.setShowHiddenDialogs,
    setSearch: data.setSearch,
  })

  useHomeShortcuts({
    selectMode: data.selectMode,
    personMerge: data.personMerge,
    lightbox: data.lightbox,
    lightboxItem: data.lightboxItem,
    handleViewModeChange: handlers.handleViewModeChange,
    handleToggleHiddenDialogs: handlers.handleToggleHiddenDialogs,
    handleHideDialog: handlers.handleHideDialog,
    groups: data.groups,
    viewMode: data.viewMode,
  })

  // DOM refs for drag select
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const dragSelect = useDragSelect({
    containerRef: gridContainerRef,
    selectMode: data.selectMode.active,
    enterSelectMode: data.selectMode.enterSelectMode,
    setSelection: data.selectMode.setSelection,
    selectedIds: data.selectMode.selectedIds,
  })
  const peopleContainerRef = useRef<HTMLDivElement>(null)
  const peopleDragSelect = useDragSelect({
    containerRef: peopleContainerRef,
    selectMode: data.personMerge.selectMode.active,
    enterSelectMode: data.personMerge.selectMode.enterSelectMode,
    setSelection: data.personMerge.selectMode.setSelection,
    selectedIds: data.personMerge.selectMode.selectedIds,
  })

  // Grid interaction handlers
  const handleLoadMore = useCallback(() => {
    data.activeSource.fetchNextPage()
  }, [data.activeSource])

  const handleItemClick = useCallback(
    (item: MediaItem) => {
      if (data.selectMode.active) return
      data.lightbox.setSelectedItem(item)
    },
    [data.selectMode.active, data.lightbox],
  )

  const handleToggle = useCallback(
    (id: number, event: React.MouseEvent) => {
      if (event.shiftKey) {
        data.selectMode.toggleRange(id, data.activeItems)
      } else {
        data.selectMode.toggle(id)
      }
    },
    [data.selectMode, data.activeItems],
  )

  const handleLongPress = useCallback(
    (item: MediaItem) => {
      if (!data.selectMode.active) {
        data.selectMode.enterSelectMode(item.id)
      }
    },
    [data.selectMode],
  )

  const handleSelectAll = useCallback(async () => {
    try {
      let ids: number[]
      if (data.viewMode === 'hidden') {
        const res = await getHiddenMediaIds(data.sortOrder)
        ids = res.ids
      } else if (data.viewMode === 'favorites') {
        const res = await getFavoritesMediaIds(data.sortOrder)
        ids = res.ids
      } else if (data.viewMode === 'people' && data.selectedPerson) {
        const res = await getPersonMediaIds({
          personId: data.selectedPerson.id,
          sort: data.sortOrder,
          faces: data.facesFilter ?? undefined,
        })
        ids = res.ids
      } else {
        const res = await getMediaIds({
          groups: data.mediaFilters.groups,
          type: data.mediaFilters.type,
          dateFrom: data.mediaFilters.dateFrom,
          dateTo: data.mediaFilters.dateTo,
          faces: data.mediaFilters.faces,
          sort: data.sortOrder,
        })
        ids = res.ids
      }
      data.selectMode.setSelection(new Set(ids))
    } catch {
      toast.error('Failed to select all')
    }
  }, [
    data.viewMode,
    data.sortOrder,
    data.selectedPerson,
    data.facesFilter,
    data.mediaFilters,
    data.selectMode,
  ])

  const handleToggleSort = useCallback(() => {
    setSearch(
      { sort: data.sortOrder === 'desc' ? 'asc' : 'desc' },
      { replace: true },
    )
    gridContainerRef.current?.scrollTo(0, 0)
  }, [setSearch, data.sortOrder])

  const handlePersonViewHide = useCallback(
    async (mediaIds: number[]) => {
      if (!data.selectedPerson || mediaIds.length === 0) return
      try {
        const result = await getCrossPersonConflicts(
          mediaIds,
          data.selectedPerson.id,
        )
        if (result.conflicts.length > 0) {
          setConflicts(result.conflicts)
          setPendingHideIds(mediaIds)
        } else {
          await hideMediaBatch(mediaIds)
          data.selectMode.exitSelectMode()
          data.invalidateActiveMedia()
          data.persons.invalidate()
          toast.success(
            `${mediaIds.length} ${mediaIds.length === 1 ? 'photo' : 'photos'} hidden`,
          )
        }
      } catch {
        toast.error('Failed to hide photos')
      }
    },
    [data],
  )

  const confirmHide = useCallback(async () => {
    try {
      await hideMediaBatch(pendingHideIds)
      setConflicts(null)
      setPendingHideIds([])
      data.selectMode.exitSelectMode()
      data.invalidateActiveMedia()
      data.persons.invalidate()
      toast.success(
        `${pendingHideIds.length} ${pendingHideIds.length === 1 ? 'photo' : 'photos'} hidden`,
      )
    } catch {
      toast.error('Failed to hide photos')
    }
  }, [pendingHideIds, data])

  // Render
  if (data.authenticated === null) return null
  if (!data.authenticated)
    return (
      <Suspense>
        <AuthFlow
          onAuthenticated={() => {
            queryClient.invalidateQueries({ queryKey: ['auth'] })
          }}
        />
      </Suspense>
    )

  return (
    <div className="flex h-dvh">
      <Sidebar
        onSync={() => data.handleSync(data.activeGroupIds)}
        onClear={handlers.handleClear}
        syncing={data.syncing}
        syncStatuses={data.syncStatuses}
        onHideDialog={handlers.handleHideDialog}
        onUnhideDialog={handlers.handleUnhideDialog}
        onUnsyncGroup={handlers.handleUnsyncGroup}
        personCount={data.faceScan.status.person_count}
        viewMode={data.viewMode}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <ViewModeTabs
          viewMode={data.viewMode}
          onViewModeChange={handlers.handleViewModeChange}
          hiddenCount={data.hiddenCount}
          favoritesCount={data.favoritesCount}
          personCount={data.faceScan.status.person_count}
        />
        {data.viewMode === 'people' && !data.selectedPerson && (
          <PeopleToolbar
            scanning={data.faceScan.scanning}
            scanProgress={{
              scanned: data.faceScan.status.scanned ?? 0,
              total: data.faceScan.status.total ?? 0,
            }}
            onStartScan={() => data.faceScan.startScan(false)}
            similarityThreshold={similarityThreshold}
            onThresholdChange={setSimilarityThreshold}
            mergeSelectActive={data.personMerge.selectMode.active}
            onEnterMergeSelect={() =>
              data.personMerge.selectMode.enterSelectMode()
            }
            onDeselectAll={data.personMerge.selectMode.deselectAll}
            searchQuery={peopleSearchQuery}
            onSearchChange={setPeopleSearchQuery}
            onClose={() => {
              if (data.personMerge.selectMode.active) {
                data.personMerge.selectMode.exitSelectMode()
              } else {
                setPeopleSearchQuery('')
                handlers.handleViewModeChange('normal')
              }
            }}
          />
        )}
        {data.viewMode === 'people' && data.selectedPerson && (
          <PersonBreadcrumb
            person={data.selectedPerson}
            onBack={() => data.setSelectedPersonId(undefined)}
          />
        )}
        <ViewModeHeader
          viewMode={data.viewMode}
          onClose={() => handlers.handleViewModeChange('normal')}
        />
        <ActiveGroupChips
          groups={data.groups}
          onToggle={data.toggleActive}
          onDeselectAll={() => {
            for (const g of data.groups.filter((group) => group.active)) {
              data.toggleActive(g)
            }
          }}
        />
        {data.viewMode === 'people' && !data.selectedPerson ? (
          <Suspense>
            <PeopleGrid
              persons={filteredPersons}
              loading={data.persons.loading}
              onPersonClick={(p: Person) => {
                data.personMerge.selectMode.exitSelectMode()
                data.setSelectedPersonId(p.id)
              }}
              selectMode={data.personMerge.selectMode.active}
              selectedIds={data.personMerge.selectMode.selectedIds}
              onToggle={data.personMerge.selectMode.toggle}
              similarGroups={
                peopleSearchQuery.trim() ? [] : data.persons.similarGroups
              }
              emptyReason={peopleSearchQuery.trim() ? 'search' : 'empty'}
              onSelectGroup={(ids) => {
                if (!data.personMerge.selectMode.active) {
                  data.personMerge.selectMode.enterSelectMode()
                }
                data.personMerge.selectMode.setSelection(new Set(ids))
              }}
              onRename={async (id, name) => {
                try {
                  await renamePerson(id, name)
                  data.persons.invalidate()
                } catch {
                  toast.error('Failed to rename person')
                }
              }}
              containerRef={peopleContainerRef}
              dragHandlers={peopleDragSelect.handlers}
              selectionRect={peopleDragSelect.selectionRect}
              onMetaClick={(id: number) => {
                const sm = data.personMerge.selectMode
                if (!sm.active) {
                  sm.enterSelectMode(id)
                } else {
                  // Read pre-toggle state before calling toggle
                  const wasSelected = sm.selectedIds.has(id)
                  const wasOnly = sm.selectedIds.size === 1
                  sm.toggle(id)
                  // Auto-exit: if the toggled person was the only selected
                  // one, selection is now empty. selectedIds still reflects
                  // the pre-toggle snapshot in this render cycle.
                  if (wasSelected && wasOnly) {
                    sm.exitSelectMode()
                  }
                }
              }}
            />
          </Suspense>
        ) : (
          <>
            {data.viewMode === 'people' && data.selectedPerson && (
              <Suspense>
                <PersonDetail
                  key={data.selectedPerson.id}
                  person={data.selectedPerson}
                  onBack={() => data.setSelectedPersonId(undefined)}
                  onRename={async (name) => {
                    try {
                      await renamePerson(data.selectedPerson!.id, name)
                      data.persons.invalidate()
                    } catch {
                      toast.error('Failed to rename person')
                    }
                  }}
                  onMerge={() => setShowMergeModal(true)}
                  onDelete={async () => {
                    try {
                      const name = data.selectedPerson!.display_name
                      await deletePerson(data.selectedPerson!.id)
                      data.setSelectedPersonId(undefined)
                      data.persons.invalidate()
                      toast.success(`Deleted ${name}`)
                    } catch {
                      toast.error('Failed to delete person')
                    }
                  }}
                />
              </Suspense>
            )}
            <MediaToolbar
              itemCount={data.activeItems.length}
              totalCount={data.totalCount}
              hiddenCount={data.hiddenCount}
              favoritesCount={data.favoritesCount}
              viewMode={data.viewMode}
              selectModeActive={data.selectMode.active}
              onEnterSelectMode={() => data.selectMode.enterSelectMode()}
              sortOrder={data.sortOrder}
              onToggleSort={handleToggleSort}
            />
            <div
              onContextMenu={(e: React.MouseEvent) => {
                if (data.viewMode !== 'people' || !data.selectedPerson) return
                if (data.selectMode.active) return
                const card = (e.target as HTMLElement).closest('[data-item-id]')
                if (!card) return
                e.preventDefault()
                const mediaId = Number(card.getAttribute('data-item-id'))
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  mediaId,
                })
              }}
            >
              <MediaGrid
                items={data.activeItems}
                hasMore={data.activeHasMore}
                loading={data.activeLoading}
                onLoadMore={handleLoadMore}
                onItemClick={handleItemClick}
                syncing={data.viewMode === 'normal' ? data.syncing : false}
                syncStatuses={data.syncStatuses}
                selectMode={data.selectMode.active}
                selectedIds={data.selectMode.selectedIds}
                onToggle={handleToggle}
                onSelectDateGroup={data.selectMode.selectDateGroup}
                onLongPress={handleLongPress}
                containerRef={gridContainerRef}
                dragHandlers={dragSelect.handlers}
                selectionRect={dragSelect.selectionRect}
              />
            </div>
          </>
        )}
      </div>
      {data.lightbox.selectedItem && (
        <Suspense>
          <Lightbox
            item={data.lightbox.selectedItem}
            onClose={data.lightbox.handleClose}
            onPrev={data.lightbox.handlePrev}
            onNext={data.lightbox.handleNext}
            hasPrev={data.lightbox.selectedIndex > 0}
            hasNext={
              data.lightbox.selectedIndex < data.activeItems.length - 1 ||
              data.activeHasMore
            }
            selected={data.selectMode.isSelected(data.lightbox.selectedItem.id)}
            favorited={!!data.lightbox.selectedItem.favorited_at}
            onToggleSelect={data.lightbox.handleToggleSelect}
            onHide={data.lightbox.handleHide}
            onUnhide={data.lightbox.handleUnhide}
            onToggleFavorite={data.lightbox.handleToggleFavorite}
          />
        </Suspense>
      )}
      {data.selectMode.active && (
        <Suspense>
          <SelectionBar
            selectedCount={data.selectMode.selectedCount}
            onSelectAll={handleSelectAll}
            onDeselectAll={data.selectMode.deselectAll}
            onDownload={data.selectMode.exitSelectMode}
            onCancel={data.selectMode.exitSelectMode}
            selectedIds={data.selectMode.selectedIds}
            viewMode={data.viewMode}
            onBeforeHide={
              data.viewMode === 'people' && data.selectedPerson
                ? async () => {
                    await handlePersonViewHide([...data.selectMode.selectedIds])
                    return false
                  }
                : undefined
            }
            onUnhide={() => {
              data.hidden.removeItems([...data.selectMode.selectedIds])
              data.selectMode.exitSelectMode()
              data.invalidateCounts()
              data.invalidateActiveMedia()
            }}
            onHide={() => {
              const ids = [...data.selectMode.selectedIds]
              data.activeSource.removeItems(ids)
              data.selectMode.exitSelectMode()
              data.invalidateCounts()
              data.invalidateActiveMedia()
            }}
            onFavorite={() => {
              data.selectMode.exitSelectMode()
              data.invalidateCounts()
              data.invalidateActiveMedia()
            }}
            onUnfavorite={() => {
              data.favorites.removeItems([...data.selectMode.selectedIds])
              data.selectMode.exitSelectMode()
              data.invalidateCounts()
              data.invalidateActiveMedia()
            }}
          />
        </Suspense>
      )}
      {data.personMerge.selectMode.active && (
        <PersonMergeBar
          selectedCount={data.personMerge.selectMode.selectedCount}
          merging={data.personMerge.merging}
          onSelectAll={() =>
            data.personMerge.selectMode.selectAll(data.persons.persons)
          }
          onDeselectAll={data.personMerge.selectMode.deselectAll}
          onMerge={data.personMerge.openKeeperPicker}
          onExitSelectMode={data.personMerge.selectMode.exitSelectMode}
          persons={data.persons.persons}
        />
      )}
      {data.personMerge.showKeeperPicker && (
        <Suspense>
          <KeepPersonPicker
            persons={data.persons.persons.filter((p) =>
              data.personMerge.selectMode.selectedIds.has(p.id),
            )}
            onSelect={data.personMerge.executeMerge}
            onClose={data.personMerge.closeKeeperPicker}
          />
        </Suspense>
      )}
      {showMergeModal && data.selectedPerson && (
        <Suspense>
          <PersonMergeModal
            persons={data.persons.persons}
            currentPersonId={data.selectedPerson.id}
            onMerge={async (mergeId) => {
              try {
                await mergePersons(data.selectedPerson!.id, mergeId)
                setShowMergeModal(false)
                data.persons.invalidate()
                queryClient.invalidateQueries({
                  queryKey: [
                    'faces',
                    'persons',
                    data.selectedPerson!.id,
                    'media',
                  ],
                })
              } catch {
                toast.error('Failed to merge persons')
              }
            }}
            onClose={() => setShowMergeModal(false)}
          />
        </Suspense>
      )}
      {contextMenu && (
        <Suspense>
          <PhotoContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onHide={() => {
              handlePersonViewHide([contextMenu.mediaId])
              setContextMenu(null)
            }}
            onClose={() => setContextMenu(null)}
          />
        </Suspense>
      )}
      {conflicts && (
        <Suspense>
          <CrossPersonWarningModal
            conflicts={conflicts}
            onConfirm={confirmHide}
            onCancel={() => {
              setConflicts(null)
              setPendingHideIds([])
            }}
          />
        </Suspense>
      )}
      {showShortcuts && (
        <Suspense>
          <ShortcutsModal onClose={() => setShowShortcuts(false)} />
        </Suspense>
      )}
    </div>
  )
}
