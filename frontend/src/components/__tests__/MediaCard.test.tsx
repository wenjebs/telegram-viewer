import { render, screen, fireEvent } from '@testing-library/react'
import MediaCard from '#/components/MediaCard'
import { makeMediaItem } from '#/test/fixtures'

// Mock use-long-press to avoid complex gesture handling in tests
vi.mock('use-long-press', () => ({
  useLongPress: () => () => ({}),
}))

describe('MediaCard', () => {
  it('renders thumbnail with correct src', () => {
    const item = makeMediaItem({ id: 42, date: '2026-01-15T12:00:00Z' })
    const { container } = render(<MediaCard item={item} onClick={vi.fn()} />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe(
      '/api/media/42/thumbnail?d=2026-01-15T12:00:00Z',
    )
  })

  it('renders play icon for video', () => {
    const item = makeMediaItem({ media_type: 'video' })
    const { container } = render(<MediaCard item={item} onClick={vi.fn()} />)
    // Play icon is &#9654; which is the black right-pointing triangle
    expect(container.textContent).toContain('\u25B6')
  })

  it('renders duration badge for video with duration', () => {
    const item = makeMediaItem({ media_type: 'video', duration: 90 })
    render(<MediaCard item={item} onClick={vi.fn()} />)
    expect(screen.getByText('1:30')).toBeTruthy()
  })

  it('does not render play icon for photo', () => {
    const item = makeMediaItem({ media_type: 'photo' })
    const { container } = render(<MediaCard item={item} onClick={vi.fn()} />)
    expect(container.textContent).not.toContain('\u25B6')
  })

  it('renders chat name', () => {
    const item = makeMediaItem({ chat_name: 'My Chat' })
    render(<MediaCard item={item} onClick={vi.fn()} />)
    expect(screen.getByText('My Chat')).toBeTruthy()
  })

  it('calls onClick when clicked', () => {
    const item = makeMediaItem()
    const onClick = vi.fn()
    const { container } = render(<MediaCard item={item} onClick={onClick} />)
    fireEvent.click(container.querySelector('img')!)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('shows select checkbox in select mode', () => {
    const item = makeMediaItem()
    const { container } = render(
      <MediaCard item={item} onClick={vi.fn()} selectMode selected={false} />,
    )
    // The checkbox circle is rendered with a specific class
    const checkbox = container.querySelector('.rounded-full.border-2')
    expect(checkbox).toBeTruthy()
  })

  it('applies selected ring style', () => {
    const item = makeMediaItem()
    const { container } = render(
      <MediaCard item={item} onClick={vi.fn()} selectMode selected />,
    )
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('ring-2')
    expect(wrapper?.className).toContain('ring-blue-500')
  })

  it('applies opacity when in select mode but not selected', () => {
    const item = makeMediaItem()
    const { container } = render(
      <MediaCard item={item} onClick={vi.fn()} selectMode selected={false} />,
    )
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('opacity-60')
  })

  it('does not show duration badge for video without duration', () => {
    const item = makeMediaItem({ media_type: 'video', duration: null })
    const { container } = render(<MediaCard item={item} onClick={vi.fn()} />)
    // Play icon present but no duration text
    expect(container.textContent).toContain('\u25B6')
    // No duration-style element
    expect(container.querySelector('.bottom-1.right-1')).toBeNull()
  })
})
