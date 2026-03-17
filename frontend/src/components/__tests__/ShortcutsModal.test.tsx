import { render, screen } from '@testing-library/react'
import ShortcutsModal from '#/components/ShortcutsModal'

describe('ShortcutsModal', () => {
  it('opens dialog (showModal called)', () => {
    const showModal = vi.fn()
    HTMLDialogElement.prototype.showModal = showModal
    render(<ShortcutsModal onClose={vi.fn()} />)
    expect(showModal).toHaveBeenCalled()
  })

  it('renders shortcut groups', () => {
    render(<ShortcutsModal onClose={vi.fn()} />)
    expect(screen.getByText('General')).toBeTruthy()
    expect(screen.getByText('Lightbox')).toBeTruthy()
    expect(screen.getByText('Selection mode')).toBeTruthy()
    // Check some shortcuts exist
    expect(screen.getByText('Show keyboard shortcuts')).toBeTruthy()
    expect(screen.getByText('Previous item')).toBeTruthy()
  })
})
