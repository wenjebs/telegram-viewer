import { render, screen, fireEvent } from '@testing-library/react'
import SelectionBar from '#/components/SelectionBar'

// Mock the API calls and hooks used by SelectionBar
vi.mock('#/api/client', () => ({
  unhideMediaBatch: vi.fn(),
  hideMediaBatch: vi.fn(),
  favoriteMediaBatch: vi.fn(),
  unfavoriteMediaBatch: vi.fn(),
}))

vi.mock('#/hooks/useZipDownload', () => ({
  useZipDownload: () => ({
    preparing: false,
    zipStatus: null,
    startDownload: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const defaultProps = {
  selectedCount: 3,
  onSelectAll: vi.fn(),
  onDeselectAll: vi.fn(),
  onDownload: vi.fn(),
  onCancel: vi.fn(),
  selectedIds: new Set([1, 2, 3]),
}

describe('SelectionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays selected count', () => {
    render(<SelectionBar {...defaultProps} />)
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('selected')).toBeTruthy()
  })

  it('calls onSelectAll when Select all clicked', () => {
    const onSelectAll = vi.fn()
    render(<SelectionBar {...defaultProps} onSelectAll={onSelectAll} />)
    fireEvent.click(screen.getByText('Select all'))
    expect(onSelectAll).toHaveBeenCalled()
  })

  it('calls onDeselectAll when Deselect clicked', () => {
    const onDeselectAll = vi.fn()
    render(<SelectionBar {...defaultProps} onDeselectAll={onDeselectAll} />)
    fireEvent.click(screen.getByText('Deselect'))
    expect(onDeselectAll).toHaveBeenCalled()
  })

  it('calls onCancel when cancel clicked', () => {
    const onCancel = vi.fn()
    render(<SelectionBar {...defaultProps} onCancel={onCancel} />)
    // Cancel button shows a cross character
    fireEvent.click(screen.getByText('\u2715'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows Unhide in hidden mode', () => {
    render(<SelectionBar {...defaultProps} viewMode="hidden" />)
    expect(screen.getByText('Unhide')).toBeTruthy()
    // Should not have Hide or Favorite buttons
    expect(screen.queryByText('Hide')).toBeNull()
  })

  it('shows Hide and Favorite in normal mode', () => {
    render(<SelectionBar {...defaultProps} viewMode="normal" />)
    expect(screen.getByText('Hide')).toBeTruthy()
    // Favorite button contains heart character
    expect(screen.getByText(/Favorite/)).toBeTruthy()
  })

  it('shows Unfavorite in favorites mode', () => {
    render(<SelectionBar {...defaultProps} viewMode="favorites" />)
    expect(screen.getByText('Unfavorite')).toBeTruthy()
    // Should not show Favorite button
    expect(screen.queryByText(/♥ Favorite/)).toBeNull()
  })

  it('shows Download button', () => {
    render(<SelectionBar {...defaultProps} />)
    expect(screen.getByText(/Download/)).toBeTruthy()
  })
})
