import { render, screen, fireEvent } from '@testing-library/react'
import PhotoContextMenu from '#/components/PhotoContextMenu'

describe('PhotoContextMenu', () => {
  const defaultProps = {
    x: 100,
    y: 200,
    onHide: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Hide photo option', () => {
    render(<PhotoContextMenu {...defaultProps} />)
    expect(screen.getByText('Hide photo')).toBeTruthy()
  })

  it('calls onHide when clicked', () => {
    const onHide = vi.fn()
    render(<PhotoContextMenu {...defaultProps} onHide={onHide} />)
    fireEvent.click(screen.getByText('Hide photo'))
    expect(onHide).toHaveBeenCalled()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<PhotoContextMenu {...defaultProps} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
