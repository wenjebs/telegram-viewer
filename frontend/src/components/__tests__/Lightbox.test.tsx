import { render, screen, fireEvent } from '@testing-library/react'
import Lightbox from '#/components/Lightbox'
import { makeMediaItem } from '#/test/fixtures'

// Mock react-hotkeys-hook to avoid key binding issues in tests
vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: vi.fn(),
}))

const defaultProps = {
  onClose: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
  hasPrev: false,
  hasNext: false,
}

describe('Lightbox', () => {
  it('opens dialog (showModal called)', () => {
    const showModal = vi.fn()
    HTMLDialogElement.prototype.showModal = showModal
    const item = makeMediaItem()
    render(<Lightbox item={item} {...defaultProps} />)
    expect(showModal).toHaveBeenCalled()
  })

  it('renders image for photo items', () => {
    const item = makeMediaItem({ media_type: 'photo', id: 1, caption: 'test' })
    render(<Lightbox item={item} {...defaultProps} />)
    const img = screen.getByAltText('test')
    expect(img.tagName).toBe('IMG')
    expect(img.getAttribute('src')).toContain('/download')
  })

  it('renders video for video items', () => {
    const item = makeMediaItem({ media_type: 'video', id: 2 })
    const { container } = render(<Lightbox item={item} {...defaultProps} />)
    const video = container.querySelector('video')
    expect(video).toBeTruthy()
    expect(video?.getAttribute('src')).toContain('/download')
  })

  it('shows prev button when hasPrev is true', () => {
    const item = makeMediaItem()
    const { container } = render(
      <Lightbox item={item} {...defaultProps} hasPrev />,
    )
    // Prev button contains &#8249; (single left-pointing angle quotation mark)
    const buttons = container.querySelectorAll('button')
    const prevBtn = Array.from(buttons).find((b) => b.textContent === '\u2039')
    expect(prevBtn).toBeTruthy()
  })

  it('shows next button when hasNext is true', () => {
    const item = makeMediaItem()
    const { container } = render(
      <Lightbox item={item} {...defaultProps} hasNext />,
    )
    const buttons = container.querySelectorAll('button')
    const nextBtn = Array.from(buttons).find((b) => b.textContent === '\u203A')
    expect(nextBtn).toBeTruthy()
  })

  it('does not show prev/next buttons when not available', () => {
    const item = makeMediaItem()
    const { container } = render(<Lightbox item={item} {...defaultProps} />)
    const buttons = container.querySelectorAll('button')
    const navBtns = Array.from(buttons).filter(
      (b) => b.textContent === '\u2039' || b.textContent === '\u203A',
    )
    expect(navBtns.length).toBe(0)
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    const item = makeMediaItem()
    render(<Lightbox item={item} {...defaultProps} onClose={onClose} />)
    const closeBtn = screen.getByText('\u00D7') // &times;
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('displays metadata (type, sender, date)', () => {
    const item = makeMediaItem({
      media_type: 'photo',
      sender_name: 'Bob',
      chat_name: 'Test Chat',
    })
    render(<Lightbox item={item} {...defaultProps} />)
    expect(screen.getByText('photo')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Test Chat')).toBeTruthy()
  })

  it('shows selected indicator when selected', () => {
    const item = makeMediaItem()
    const { container } = render(
      <Lightbox item={item} {...defaultProps} selected />,
    )
    // Selected indicator is a circle with checkmark svg
    const indicator = container.querySelector('.border-accent.bg-accent')
    expect(indicator).toBeTruthy()
  })

  it('shows Hide button when onHide provided', () => {
    const onHide = vi.fn()
    const item = makeMediaItem()
    render(<Lightbox item={item} {...defaultProps} onHide={onHide} />)
    expect(screen.getByText('Hide')).toBeTruthy()
  })

  it('shows Unhide button when onUnhide provided', () => {
    const onUnhide = vi.fn()
    const item = makeMediaItem()
    render(<Lightbox item={item} {...defaultProps} onUnhide={onUnhide} />)
    expect(screen.getByText('Unhide')).toBeTruthy()
  })
})
