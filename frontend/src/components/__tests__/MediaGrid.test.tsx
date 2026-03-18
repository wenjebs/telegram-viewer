import { render, screen } from '@testing-library/react'
import MediaGrid from '#/components/MediaGrid'
import { makeMediaItem } from '#/test/fixtures'

// Stub ResizeObserver for jsdom
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// Mock use-long-press used by MediaCard
vi.mock('use-long-press', () => ({
  useLongPress: () => () => ({}),
}))

// Mock @tanstack/react-virtual since jsdom has no layout engine
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({
        index: i,
        start: i * 300,
        size: 300,
        key: String(i),
      })),
    getTotalSize: () => opts.count * 300,
    measureElement: vi.fn(),
    measure: vi.fn(),
  }),
}))

describe('MediaGrid', () => {
  const defaultProps = {
    hasMore: false,
    loading: false,
    onLoadMore: vi.fn(),
    onItemClick: vi.fn(),
    syncing: false,
    syncStatuses: {},
  }

  it('renders empty state when no items and not loading', () => {
    render(<MediaGrid items={[]} {...defaultProps} />)
    expect(screen.getByText(/No media yet/)).toBeTruthy()
  })

  it('renders syncing state when syncing with no items', () => {
    render(<MediaGrid items={[]} {...defaultProps} syncing syncStatuses={{}} />)
    expect(screen.getByText(/Syncing/)).toBeTruthy()
  })

  it('groups items by date', () => {
    const items = [
      makeMediaItem({ date: '2026-01-15T12:00:00Z' }),
      makeMediaItem({ date: '2026-01-15T14:00:00Z' }),
      makeMediaItem({ date: '2026-01-16T12:00:00Z' }),
    ]
    const { container } = render(<MediaGrid items={items} {...defaultProps} />)
    // Two date groups rendered
    const headers = container.querySelectorAll('h3')
    expect(headers.length).toBe(2)
  })

  it('renders date headers with formatted dates', () => {
    const items = [makeMediaItem({ date: '2026-01-15T12:00:00Z' })]
    render(<MediaGrid items={items} {...defaultProps} />)
    const heading = screen.getByRole('heading')
    expect(heading.textContent).toContain('January')
    expect(heading.textContent).toContain('15')
  })

  it('shows skeleton when loading with more pages', () => {
    const items = [makeMediaItem()]
    render(<MediaGrid items={items} {...defaultProps} hasMore loading />)
    expect(screen.getByTestId('skeleton-header')).toBeTruthy()
  })
})
