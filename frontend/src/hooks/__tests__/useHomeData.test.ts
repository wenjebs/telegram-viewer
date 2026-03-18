import { renderHook, waitFor } from '@testing-library/react'
import { vi, type Mock } from 'vitest'
import { createWrapper } from '#/test/wrapper'
import { makeMediaItem } from '#/test/fixtures'
import { useHomeData } from '#/hooks/useHomeData'
import type { MediaItem } from '#/api/schemas'

// Mock all dependencies
vi.mock('#/hooks/useSearchParam', () => ({
  useSearchParams: vi.fn(() => ({
    search: {},
    setSearch: vi.fn(),
  })),
}))

vi.mock('#/stores/appStore', () => ({
  useAppStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ similarityThreshold: 0.4 }),
  ),
}))

vi.mock('#/hooks/useGroups', () => ({
  useGroups: vi.fn(() => ({
    groups: [],
    toggleActive: vi.fn(),
    unsyncGroup: vi.fn(),
    activeGroupIds: [],
    refetch: vi.fn(),
    previewCounts: {},
  })),
}))

const mockMediaReturn = (items: MediaItem[] = []) => ({
  items,
  loading: false,
  error: null,
  hasMore: false,
  fetchNextPage: vi.fn(),
  removeItem: vi.fn(),
  removeItems: vi.fn(),
})

vi.mock('#/hooks/useMedia', () => ({
  useMedia: vi.fn(() => mockMediaReturn()),
}))

vi.mock('#/hooks/useHiddenMedia', () => ({
  useHiddenMedia: vi.fn(() => mockMediaReturn()),
}))

vi.mock('#/hooks/useFavoritesMedia', () => ({
  useFavoritesMedia: vi.fn(() => mockMediaReturn()),
}))

vi.mock('#/hooks/usePersons', () => ({
  usePersons: vi.fn(() => ({
    persons: [],
    loading: false,
    similarGroups: [],
    refetch: vi.fn(),
    invalidate: vi.fn(),
  })),
}))

vi.mock('#/hooks/usePersonMedia', () => ({
  usePersonMedia: vi.fn(() => mockMediaReturn()),
}))

vi.mock('#/hooks/useFaceScan', () => ({
  useFaceScan: vi.fn(() => ({
    scanning: false,
    status: { status: 'idle', scanned: 0, total: 0, person_count: 0 },
    startScan: vi.fn(),
  })),
}))

vi.mock('#/hooks/useSelectMode', () => ({
  useSelectMode: vi.fn(() => ({
    active: false,
    selectedIds: new Set(),
    selectedCount: 0,
    enterSelectMode: vi.fn(),
    exitSelectMode: vi.fn(),
    setSelection: vi.fn(),
    toggle: vi.fn(),
    toggleRange: vi.fn(),
    selectAll: vi.fn(),
    selectDateGroup: vi.fn(),
    deselectAll: vi.fn(),
    isSelected: vi.fn(() => false),
  })),
}))

vi.mock('#/hooks/useSyncStatus', () => ({
  useSyncStatus: vi.fn(() => ({
    syncing: false,
    syncStatuses: {},
    handleSync: vi.fn(),
  })),
}))

vi.mock('#/hooks/useLightbox', () => ({
  useLightbox: vi.fn(() => ({
    selectedItem: null,
    setSelectedItem: vi.fn(),
    selectedIndex: -1,
    justClosedLightboxRef: { current: false },
    handlePrev: vi.fn(),
    handleNext: vi.fn(),
    handleClose: vi.fn(),
    handleToggleSelect: vi.fn(),
    handleHide: vi.fn(),
    handleUnhide: vi.fn(),
    handleToggleFavorite: vi.fn(),
  })),
}))

vi.mock('#/hooks/usePrefetch', () => ({
  usePrefetch: vi.fn(),
}))

vi.mock('#/hooks/usePersonMerge', () => ({
  usePersonMerge: vi.fn(() => ({
    selectMode: {
      active: false,
      selectedIds: new Set(),
      selectedCount: 0,
      enterSelectMode: vi.fn(),
      exitSelectMode: vi.fn(),
      setSelection: vi.fn(),
      toggle: vi.fn(),
      toggleRange: vi.fn(),
      selectAll: vi.fn(),
      selectDateGroup: vi.fn(),
      deselectAll: vi.fn(),
      isSelected: vi.fn(() => false),
    },
    showKeeperPicker: false,
    merging: false,
    openKeeperPicker: vi.fn(),
    closeKeeperPicker: vi.fn(),
    executeMerge: vi.fn(),
  })),
}))

vi.mock('#/api/client', () => ({
  getAuthStatus: vi.fn(),
  getHiddenCount: vi.fn(),
  getFavoritesCount: vi.fn(),
  getMediaCount: vi.fn(),
  getHiddenDialogCount: vi.fn(),
  getHiddenDialogs: vi.fn(),
}))

// Re-import mocked modules so we can control them per-test
import { useSearchParams } from '#/hooks/useSearchParam'
import { useMedia } from '#/hooks/useMedia'
import { useHiddenMedia } from '#/hooks/useHiddenMedia'
import { useFavoritesMedia } from '#/hooks/useFavoritesMedia'
import { usePersonMedia } from '#/hooks/usePersonMedia'
import { usePersons } from '#/hooks/usePersons'
import {
  getAuthStatus,
  getHiddenCount,
  getFavoritesCount,
  getMediaCount,
  getHiddenDialogCount,
  getHiddenDialogs,
} from '#/api/client'

describe('useHomeData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getAuthStatus as Mock).mockResolvedValue({ authenticated: true })
    ;(getHiddenCount as Mock).mockResolvedValue({ count: 5 })
    ;(getFavoritesCount as Mock).mockResolvedValue({ count: 3 })
    ;(getMediaCount as Mock).mockResolvedValue({ count: 100 })
    ;(getHiddenDialogCount as Mock).mockResolvedValue({ count: 2 })
    ;(getHiddenDialogs as Mock).mockResolvedValue([])
  })

  it('returns activeItems sorted by sortOrder desc', () => {
    const items = [
      makeMediaItem({ date: '2026-01-01T00:00:00Z' }),
      makeMediaItem({ date: '2026-01-03T00:00:00Z' }),
      makeMediaItem({ date: '2026-01-02T00:00:00Z' }),
    ]
    ;(useMedia as Mock).mockReturnValue(mockMediaReturn(items))

    const { result } = renderHook(() => useHomeData(), {
      wrapper: createWrapper(),
    })

    const dates = result.current.activeItems.map((i) => i.date)
    expect(dates).toEqual([
      '2026-01-03T00:00:00Z',
      '2026-01-02T00:00:00Z',
      '2026-01-01T00:00:00Z',
    ])
  })

  it('returns activeItems sorted by sortOrder asc', () => {
    ;(useSearchParams as Mock).mockReturnValue({
      search: { sort: 'asc' },
      setSearch: vi.fn(),
    })

    const items = [
      makeMediaItem({ date: '2026-01-03T00:00:00Z' }),
      makeMediaItem({ date: '2026-01-01T00:00:00Z' }),
      makeMediaItem({ date: '2026-01-02T00:00:00Z' }),
    ]
    ;(useMedia as Mock).mockReturnValue(mockMediaReturn(items))

    const { result } = renderHook(() => useHomeData(), {
      wrapper: createWrapper(),
    })

    const dates = result.current.activeItems.map((i) => i.date)
    expect(dates).toEqual([
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      '2026-01-03T00:00:00Z',
    ])
  })

  it('uses hidden source when viewMode is hidden', () => {
    ;(useSearchParams as Mock).mockReturnValue({
      search: { mode: 'hidden' },
      setSearch: vi.fn(),
    })

    const hiddenItems = [makeMediaItem({ date: '2026-02-01T00:00:00Z' })]
    ;(useHiddenMedia as Mock).mockReturnValue(mockMediaReturn(hiddenItems))
    ;(useMedia as Mock).mockReturnValue(mockMediaReturn([]))

    const { result } = renderHook(() => useHomeData(), {
      wrapper: createWrapper(),
    })

    expect(result.current.viewMode).toBe('hidden')
    expect(result.current.activeItems).toHaveLength(1)
    expect(result.current.activeItems[0].date).toBe('2026-02-01T00:00:00Z')
  })

  it('derives authenticated=true from successful auth query', async () => {
    ;(getAuthStatus as Mock).mockResolvedValue({ authenticated: true })

    const { result } = renderHook(() => useHomeData(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.authenticated).toBe(true)
    })
  })

  it('derives authenticated=false when auth query errors', async () => {
    ;(getAuthStatus as Mock).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useHomeData(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.authenticated).toBe(false)
    })
  })

  it('uses favorites source when viewMode is favorites', () => {
    ;(useSearchParams as Mock).mockReturnValue({
      search: { mode: 'favorites' },
      setSearch: vi.fn(),
    })

    const favItems = [makeMediaItem({ date: '2026-03-01T00:00:00Z' })]
    ;(useFavoritesMedia as Mock).mockReturnValue(mockMediaReturn(favItems))
    ;(useMedia as Mock).mockReturnValue(mockMediaReturn([]))

    const { result } = renderHook(() => useHomeData(), {
      wrapper: createWrapper(),
    })

    expect(result.current.viewMode).toBe('favorites')
    expect(result.current.activeItems).toHaveLength(1)
  })

  it('uses personMedia source when in people mode with selected person', () => {
    ;(useSearchParams as Mock).mockReturnValue({
      search: { mode: 'people', person: 42 },
      setSearch: vi.fn(),
    })

    const personItems = [makeMediaItem({ date: '2026-04-01T00:00:00Z' })]
    ;(usePersonMedia as Mock).mockReturnValue(mockMediaReturn(personItems))
    ;(usePersons as Mock).mockReturnValue({
      persons: [{ id: 42, name: 'Alice' }],
      loading: false,
      similarGroups: [],
      refetch: vi.fn(),
      invalidate: vi.fn(),
    })
    ;(useMedia as Mock).mockReturnValue(mockMediaReturn([]))

    const { result } = renderHook(() => useHomeData(), {
      wrapper: createWrapper(),
    })

    expect(result.current.selectedPerson).toEqual({
      id: 42,
      name: 'Alice',
    })
    expect(result.current.activeItems).toHaveLength(1)
  })
})
