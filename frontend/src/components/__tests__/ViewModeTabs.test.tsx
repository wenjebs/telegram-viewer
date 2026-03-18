// frontend/src/components/__tests__/ViewModeTabs.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import ViewModeTabs from '#/components/ViewModeTabs'

const defaultProps = {
  viewMode: 'normal' as const,
  onViewModeChange: vi.fn(),
}

describe('ViewModeTabs', () => {
  it('renders all four tabs', () => {
    render(<ViewModeTabs {...defaultProps} />)
    expect(screen.getByRole('tab', { name: /gallery/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /hidden/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /favorites/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /people/i })).toBeTruthy()
  })

  it('marks the active tab as selected', () => {
    render(<ViewModeTabs {...defaultProps} viewMode="favorites" />)
    expect(screen.getByRole('tab', { name: /favorites/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: /gallery/i })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('calls onViewModeChange when a tab is clicked', () => {
    const onViewModeChange = vi.fn()
    render(
      <ViewModeTabs {...defaultProps} onViewModeChange={onViewModeChange} />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /hidden/i }))
    expect(onViewModeChange).toHaveBeenCalledWith('hidden')
  })

  it('toggles back to normal when clicking the active tab', () => {
    const onViewModeChange = vi.fn()
    render(
      <ViewModeTabs
        {...defaultProps}
        viewMode="hidden"
        onViewModeChange={onViewModeChange}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /hidden/i }))
    expect(onViewModeChange).toHaveBeenCalledWith('normal')
  })

  it('shows count badges when provided', () => {
    render(
      <ViewModeTabs
        {...defaultProps}
        hiddenCount={5}
        favoritesCount={12}
        personCount={3}
      />,
    )
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('does not show badges for zero counts', () => {
    render(
      <ViewModeTabs
        {...defaultProps}
        hiddenCount={0}
        favoritesCount={0}
        personCount={0}
      />,
    )
    expect(screen.queryByText('0')).toBeNull()
  })
})
