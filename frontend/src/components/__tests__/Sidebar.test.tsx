import { render, screen, fireEvent } from '@testing-library/react'
import Sidebar from '#/components/Sidebar'
import { makeGroup } from '#/test/fixtures'

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

const defaultProps = {
  width: 280,
  onWidthChange: vi.fn(),
  groups: [
    makeGroup({ id: 1, name: 'Chat A', active: true, type: 'group' }),
    makeGroup({ id: 2, name: 'Chat B', active: false, type: 'dm' }),
  ],
  onToggleGroup: vi.fn(),
  mediaTypeFilter: null,
  onMediaTypeFilter: vi.fn(),
  chatTypeFilter: null,
  onChatTypeFilter: vi.fn(),
  syncFilter: null,
  onSyncFilter: vi.fn(),
  dateRange: undefined,
  onDateRangeChange: vi.fn(),
  onSync: vi.fn(),
  onClear: vi.fn(),
  syncing: false,
  syncStatuses: {},
}

describe('Sidebar', () => {
  it('renders group list', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByText('Chat A')).toBeTruthy()
    expect(screen.getByText('Chat B')).toBeTruthy()
  })

  it('calls onToggleGroup when group name clicked', () => {
    const onToggleGroup = vi.fn()
    render(
      <Sidebar
        {...defaultProps}
        onToggleGroup={onToggleGroup}
      />,
    )
    fireEvent.click(screen.getByText('Chat A'))
    expect(onToggleGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, name: 'Chat A' }),
    )
  })

  it('filters by search input', () => {
    render(<Sidebar {...defaultProps} />)
    const input = screen.getByPlaceholderText('Search chats...')
    fireEvent.change(input, { target: { value: 'Chat A' } })
    expect(screen.getByText('Chat A')).toBeTruthy()
    expect(screen.queryByText('Chat B')).toBeNull()
  })

  it('renders media type filter buttons in normal view mode', () => {
    render(<Sidebar {...defaultProps} viewMode="normal" />)
    expect(screen.getByText('Photos')).toBeTruthy()
    expect(screen.getByText('Videos')).toBeTruthy()
  })

  it('calls onMediaTypeFilter when filter button clicked', () => {
    const onMediaTypeFilter = vi.fn()
    render(
      <Sidebar
        {...defaultProps}
        viewMode="normal"
        onMediaTypeFilter={onMediaTypeFilter}
      />,
    )
    fireEvent.click(screen.getByText('Photos'))
    expect(onMediaTypeFilter).toHaveBeenCalledWith('photo')
  })

  it('renders view mode buttons when onViewModeChange provided', () => {
    render(
      <Sidebar
        {...defaultProps}
        onViewModeChange={vi.fn()}
        hiddenCount={5}
        favoritesCount={10}
      />,
    )
    expect(screen.getByText('Hidden')).toBeTruthy()
    expect(screen.getByText('Favorites')).toBeTruthy()
    // "People" appears both as chat type filter and view mode button
    expect(screen.getAllByText('People').length).toBeGreaterThanOrEqual(2)
    // Count badges
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
  })

  it('renders Sync and Clear buttons', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByText('Sync')).toBeTruthy()
    expect(screen.getByText('Clear')).toBeTruthy()
  })

  it('disables Sync button when syncing', () => {
    render(<Sidebar {...defaultProps} syncing />)
    expect(screen.getByText('Syncing...')).toBeTruthy()
    const btn = screen
      .getByText('Syncing...')
      .closest('button') as HTMLButtonElement
    expect(btn?.disabled).toBe(true)
  })
})
