import { render, screen, fireEvent } from '@testing-library/react'
import { vi, type Mock } from 'vitest'
import Sidebar from '#/components/Sidebar'
import { makeGroup } from '#/test/fixtures'
import { createWrapper } from '#/test/wrapper'

// Mock DateRangeFilter to avoid react-day-picker complexity
vi.mock('#/components/DateRangeFilter', () => ({
  default: ({
    dateRange,
    onDateRangeChange,
  }: {
    dateRange: unknown
    onDateRangeChange: (v: undefined) => void
  }) => (
    <div data-testid="date-range-filter">
      {dateRange != null && (
        <button onClick={() => onDateRangeChange(undefined)}>
          ClearDateRange
        </button>
      )}
    </div>
  ),
}))

// Mock fuse.js
vi.mock('fuse.js', () => ({
  default: class {
    items: { name: string }[]
    constructor(items: { name: string }[]) {
      this.items = items
    }
    search(query: string) {
      return this.items
        .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
        .map((item) => ({ item }))
    }
  },
}))

// Mock react-hotkeys-hook
vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: vi.fn(),
}))

const mockGroups = [
  makeGroup({ id: 1, name: 'Chat A', active: true, type: 'group' }),
  makeGroup({ id: 2, name: 'Chat B', active: false, type: 'dm' }),
]

const mockToggleActive = vi.fn()

// Mock useSearchParams
vi.mock('#/hooks/useSearchParam', () => ({
  useSearchParams: vi.fn(() => ({
    search: {},
    setSearch: vi.fn(),
  })),
}))

// Mock useAppStore
vi.mock('#/stores/appStore', () => ({
  useAppStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      sidebarWidth: 280,
      setSidebarWidth: vi.fn(),
    }),
  ),
}))

// Mock useGroups
vi.mock('#/hooks/useGroups', () => ({
  useGroups: vi.fn(() => ({
    groups: mockGroups,
    toggleActive: mockToggleActive,
    previewCounts: {},
    activeGroupIds: [1],
    unsyncGroup: vi.fn(),
    refetch: vi.fn(),
  })),
}))

// Mock api/client for count queries
vi.mock('#/api/client', () => ({
  getMediaCount: vi.fn().mockResolvedValue({ count: 0 }),
  getHiddenDialogCount: vi.fn().mockResolvedValue({ count: 0 }),
  getHiddenDialogs: vi.fn().mockResolvedValue([]),
}))

// Mock format util
vi.mock('#/utils/format', () => ({
  formatDateParam: vi.fn((d: Date) => d.toISOString().slice(0, 10)),
}))

import { useSearchParams } from '#/hooks/useSearchParam'
import { useGroups } from '#/hooks/useGroups'

const defaultProps = {
  onSync: vi.fn(),
  onClear: vi.fn(),
  syncing: false,
  syncStatuses: {},
  onHideDialog: vi.fn(),
  onUnhideDialog: vi.fn(),
  onUnsyncGroup: vi.fn(),
  personCount: 0,
  viewMode: 'normal',
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSearchParams as Mock).mockReturnValue({
      search: {},
      setSearch: vi.fn(),
    })
    ;(useGroups as Mock).mockReturnValue({
      groups: mockGroups,
      toggleActive: mockToggleActive,
      previewCounts: {},
      activeGroupIds: [1],
      unsyncGroup: vi.fn(),
      refetch: vi.fn(),
    })
  })

  it('renders group list', async () => {
    render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() })
    expect(await screen.findByText('Chat A')).toBeTruthy()
    expect(screen.getByText('Chat B')).toBeTruthy()
  })

  it('calls toggleActive when group name clicked', () => {
    render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Chat A'))
    expect(mockToggleActive).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, name: 'Chat A' }),
    )
  })

  it('filters by search input', () => {
    render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() })
    const input = screen.getByPlaceholderText('Search chats...')
    fireEvent.change(input, { target: { value: 'Chat A' } })
    expect(screen.getByText('Chat A')).toBeTruthy()
    expect(screen.queryByText('Chat B')).toBeNull()
  })

  it('renders media type filter buttons in normal view mode', () => {
    render(<Sidebar {...defaultProps} viewMode="normal" />, {
      wrapper: createWrapper(),
    })
    // Expand the Filters disclosure
    fireEvent.click(screen.getByRole('button', { name: /filters/i }))
    expect(screen.getByText('Photos')).toBeTruthy()
    expect(screen.getByText('Videos')).toBeTruthy()
  })

  it('updates search params when filter button clicked', () => {
    const mockSetSearch = vi.fn()
    ;(useSearchParams as Mock).mockReturnValue({
      search: {},
      setSearch: mockSetSearch,
    })
    render(<Sidebar {...defaultProps} viewMode="normal" />, {
      wrapper: createWrapper(),
    })
    fireEvent.click(screen.getByRole('button', { name: /filters/i }))
    fireEvent.click(screen.getByText('Photos'))
    expect(mockSetSearch).toHaveBeenCalledWith(
      { media: 'photo' },
      { replace: true },
    )
  })

  it('shows Filters disclosure that expands to reveal media type filters', () => {
    render(<Sidebar {...defaultProps} viewMode="normal" />, {
      wrapper: createWrapper(),
    })
    const disclosure = screen.getByRole('button', { name: /filters/i })
    expect(disclosure).toBeTruthy()
    // Collapsed by default: aria-expanded is false
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    // Expand
    fireEvent.click(disclosure)
    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Photos')).toBeTruthy()
    expect(screen.getByText('Videos')).toBeTruthy()
  })

  it('renders Clear button with danger styling', () => {
    render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() })
    const clearBtn = screen.getByText('Clear').closest('button')!
    expect(clearBtn.className).toMatch(/border-danger/)
    expect(clearBtn.className).toMatch(/text-danger/)
  })

  it('renders Sync and Clear buttons', () => {
    render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() })
    expect(screen.getByText('Sync')).toBeTruthy()
    expect(screen.getByText('Clear')).toBeTruthy()
  })

  it('disables Sync button when syncing', () => {
    render(<Sidebar {...defaultProps} syncing />, {
      wrapper: createWrapper(),
    })
    expect(screen.getByText('Syncing...')).toBeTruthy()
    const btn = screen
      .getByText('Syncing...')
      .closest('button') as HTMLButtonElement
    expect(btn?.disabled).toBe(true)
  })

  it('renders FilterDisclosure in people view with selected person', () => {
    ;(useSearchParams as Mock).mockReturnValue({
      search: { person: 42 },
      setSearch: vi.fn(),
    })
    render(<Sidebar {...defaultProps} viewMode="people" />, {
      wrapper: createWrapper(),
    })
    const disclosure = screen.getByRole('button', { name: /filters/i })
    expect(disclosure).toBeTruthy()
    fireEvent.click(disclosure)
    expect(screen.getByText('Photos')).toBeTruthy()
    expect(screen.getByText('Videos')).toBeTruthy()
  })

  it('hides FilterDisclosure in people view without selected person', () => {
    ;(useSearchParams as Mock).mockReturnValue({
      search: {},
      setSearch: vi.fn(),
    })
    render(<Sidebar {...defaultProps} viewMode="people" />, {
      wrapper: createWrapper(),
    })
    expect(screen.queryByRole('button', { name: /filters/i })).toBeNull()
  })
})
