import { render, screen, fireEvent } from '@testing-library/react'
import ViewModeHeader from '#/components/ViewModeHeader'

describe('ViewModeHeader', () => {
  it('renders Delete All button in hidden mode', () => {
    render(
      <ViewModeHeader
        viewMode="hidden"
        onClose={vi.fn()}
        onDeleteAll={vi.fn()}
        hiddenCount={5}
      />,
    )
    expect(screen.getByText('Delete All')).toBeTruthy()
  })

  it('calls onDeleteAll when clicked', () => {
    const onDeleteAll = vi.fn()
    render(
      <ViewModeHeader
        viewMode="hidden"
        onClose={vi.fn()}
        onDeleteAll={onDeleteAll}
        hiddenCount={5}
      />,
    )
    fireEvent.click(screen.getByText('Delete All'))
    expect(onDeleteAll).toHaveBeenCalled()
  })

  it('disables Delete All when hiddenCount is 0', () => {
    render(
      <ViewModeHeader
        viewMode="hidden"
        onClose={vi.fn()}
        onDeleteAll={vi.fn()}
        hiddenCount={0}
      />,
    )
    expect(screen.getByText('Delete All').closest('button')?.disabled).toBe(
      true,
    )
  })

  it('does not render Delete All in favorites mode', () => {
    render(<ViewModeHeader viewMode="favorites" onClose={vi.fn()} />)
    expect(screen.queryByText('Delete All')).toBeNull()
  })

  it('returns null for normal mode', () => {
    const { container } = render(
      <ViewModeHeader viewMode="normal" onClose={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })
})
