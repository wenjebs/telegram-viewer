import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DateRange } from 'react-day-picker'
import type { MediaItem } from '#/api/schemas'
import {
  getAuthStatus,
  getHiddenCount,
  getFavoritesCount,
  getMediaCount,
  getHiddenDialogCount,
  getHiddenDialogs,
} from '#/api/client'
import { useSearchParams } from '#/hooks/useSearchParam'
import { useAppStore } from '#/stores/appStore'
import { useGroups } from '#/hooks/useGroups'
import { useMedia } from '#/hooks/useMedia'
import type { MediaFilters } from '#/hooks/useMedia'
import { useHiddenMedia } from '#/hooks/useHiddenMedia'
import { useFavoritesMedia } from '#/hooks/useFavoritesMedia'
import { usePersons } from '#/hooks/usePersons'
import { usePersonMedia } from '#/hooks/usePersonMedia'
import { useFaceScan } from '#/hooks/useFaceScan'
import { useSelectMode } from '#/hooks/useSelectMode'
import { useSyncStatus } from '#/hooks/useSyncStatus'
import { useLightbox } from '#/hooks/useLightbox'
import { usePrefetch } from '#/hooks/usePrefetch'
import { usePersonMerge } from '#/hooks/usePersonMerge'
import { formatDateParam } from '#/utils/format'

export type ViewMode = 'normal' | 'hidden' | 'favorites' | 'people'

export function useHomeData() {
  const queryClient = useQueryClient()

  // #region Auth (migrated to useQuery)
  const { data: authStatus, isError: authError } = useQuery({
    queryKey: ['auth'],
    queryFn: getAuthStatus,
    retry: false,
  })
  const authenticated = authError ? false : (authStatus?.authenticated ?? null)
  // #endregion

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
  const sortOrder = search.sort ?? 'desc'
  const showHiddenDialogs = search.hiddenDialogs ?? false
  // #endregion

  // #region Count queries
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
  const { data: hiddenDialogCount = 0 } = useQuery({
    queryKey: ['counts', 'hiddenDialogs'],
    queryFn: () => getHiddenDialogCount().then((r) => r.count),
    enabled: authenticated === true,
  })
  // #endregion

  // #region Hidden dialogs (migrated to useQuery)
  const { data: hiddenDialogs = [] } = useQuery({
    queryKey: ['hiddenDialogs'],
    queryFn: getHiddenDialogs,
    enabled: showHiddenDialogs,
  })
  // #endregion

  // #region App store
  const similarityThreshold = useAppStore((s) => s.similarityThreshold)
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
      sort: sortOrder,
    }),
    [activeGroupIds, mediaTypeFilter, dateFrom, dateTo, facesFilter, sortOrder],
  )

  const { data: totalCount = 0 } = useQuery({
    queryKey: [
      'counts',
      'total',
      mediaFilters.groups,
      mediaFilters.type,
      mediaFilters.dateFrom,
      mediaFilters.dateTo,
      mediaFilters.faces,
    ],
    queryFn: () =>
      getMediaCount({
        groups: mediaFilters.groups,
        type: mediaFilters.type,
        dateFrom: mediaFilters.dateFrom,
        dateTo: mediaFilters.dateTo,
        faces: mediaFilters.faces,
      }).then((r) => r.count),
    enabled: authenticated === true,
  })

  const media = useMedia(mediaFilters, authenticated === true)
  const hidden = useHiddenMedia(
    viewMode === 'hidden' && authenticated === true,
    sortOrder,
  )
  const favorites = useFavoritesMedia(
    viewMode === 'favorites' && authenticated === true,
    sortOrder,
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
    sortOrder,
    facesFilter,
  )
  const faceScan = useFaceScan({
    onScanComplete: () => persons.invalidate(),
  })
  const selectMode = useSelectMode()
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
      [...activeSource.items].toSorted((a, b) =>
        sortOrder === 'asc'
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date),
      ),
    [activeSource.items, sortOrder],
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
        setSearch({ item: item.id }, { replace: !!search.item })
      } else {
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
  // Auto-set mode=people when person is in URL but mode isn't
  useEffect(() => {
    if (search.person && viewMode !== 'people') {
      setSearch({ mode: 'people' }, { replace: true })
    }
  }, [search.person, viewMode, setSearch])

  // Trigger pagination when lightbox navigation approaches the boundary
  useEffect(() => {
    if (
      lightbox.selectedIndex >= 0 &&
      activeItems.length - lightbox.selectedIndex <= 10 &&
      activeHasMore
    ) {
      activeSource.fetchNextPage()
    }
  }, [lightbox.selectedIndex, activeItems.length, activeHasMore, activeSource])
  // #endregion

  return {
    authenticated,
    groups,
    toggleActive,
    unsyncGroup,
    activeGroupIds,
    refetchGroups,
    previewCounts,
    media,
    hidden,
    favorites,
    personMedia,
    persons,
    faceScan,
    activeItems,
    activeSource,
    activeLoading,
    activeHasMore,
    selectedPerson,
    hiddenCount,
    favoritesCount,
    totalCount,
    hiddenDialogCount,
    selectMode,
    personMerge,
    lightbox,
    lightboxItem,
    syncing,
    syncStatuses,
    handleSync,
    invalidateCounts,
    invalidateActiveMedia,
    setSelectedPersonId,
    mediaFilters,
    viewMode,
    sortOrder,
    showHiddenDialogs,
    hiddenDialogs,
    // URL state helpers
    mediaTypeFilter,
    chatTypeFilter,
    syncFilter,
    facesFilter,
    dateRange,
    setMediaTypeFilter,
    setChatTypeFilter,
    setSyncFilter,
    setDateRange,
    setShowHiddenDialogs,
    search,
    setSearch,
  }
}
