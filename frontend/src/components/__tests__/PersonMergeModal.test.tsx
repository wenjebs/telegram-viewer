import { render, screen, fireEvent } from '@testing-library/react'
import PersonMergeModal from '#/components/PersonMergeModal'
import { makePerson } from '#/test/fixtures'

describe('PersonMergeModal', () => {
  const persons = [
    makePerson({ id: 1, display_name: 'Alice' }),
    makePerson({ id: 2, display_name: 'Bob' }),
    makePerson({ id: 3, display_name: 'Charlie' }),
  ]

  const defaultProps = {
    persons,
    currentPersonId: 1,
    onMerge: vi.fn(),
    onClose: vi.fn(),
  }

  it('opens dialog (showModal called)', () => {
    const showModal = vi.fn()
    HTMLDialogElement.prototype.showModal = showModal
    render(<PersonMergeModal {...defaultProps} />)
    expect(showModal).toHaveBeenCalled()
  })

  it('lists persons except current', () => {
    render(<PersonMergeModal {...defaultProps} />)
    // Should show Bob and Charlie but not Alice
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Charlie')).toBeTruthy()
    expect(screen.queryByText('Alice')).toBeNull()
  })

  it('calls onMerge with selected id', () => {
    const onMerge = vi.fn()
    render(<PersonMergeModal {...defaultProps} onMerge={onMerge} />)
    fireEvent.click(screen.getByText('Bob'))
    expect(onMerge).toHaveBeenCalledWith(2)
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      <PersonMergeModal {...defaultProps} onClose={onClose} />,
    )
    // The close button has an SVG with an X pattern
    const closeBtn = container
      .querySelector('button svg path[d="M6 6l8 8M14 6l-8 8"]')
      ?.closest('button')
    expect(closeBtn).toBeTruthy()
    fireEvent.click(closeBtn!)
    expect(onClose).toHaveBeenCalled()
  })
})
