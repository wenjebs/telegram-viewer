import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import MediaGrid from '../MediaGrid'
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

describe('MediaGrid skeleton', () => {
  it('shows skeleton when loading and hasMore', () => {
    render(
      <MediaGrid
        items={[makeMediaItem()]}
        hasMore={true}
        loading={true}
        onLoadMore={() => {}}
        onItemClick={() => {}}
        syncing={false}
        syncStatuses={{}}
      />,
    )
    expect(screen.getByTestId('skeleton-header')).toBeTruthy()
  })

  it('does not show skeleton when not loading', () => {
    render(
      <MediaGrid
        items={[makeMediaItem()]}
        hasMore={true}
        loading={false}
        onLoadMore={() => {}}
        onItemClick={() => {}}
        syncing={false}
        syncStatuses={{}}
      />,
    )
    expect(screen.queryByTestId('skeleton-header')).toBeNull()
  })

  it('does not render a Load more button', () => {
    render(
      <MediaGrid
        items={[makeMediaItem()]}
        hasMore={true}
        loading={false}
        onLoadMore={() => {}}
        onItemClick={() => {}}
        syncing={false}
        syncStatuses={{}}
      />,
    )
    expect(screen.queryByText('Load more')).toBeNull()
  })

  it('shows skeleton on initial load (no items yet)', () => {
    render(
      <MediaGrid
        items={[]}
        hasMore={true}
        loading={true}
        onLoadMore={() => {}}
        onItemClick={() => {}}
        syncing={false}
        syncStatuses={{}}
      />,
    )
    expect(screen.getAllByTestId('skeleton-header')[0]).toBeTruthy()
  })
})
