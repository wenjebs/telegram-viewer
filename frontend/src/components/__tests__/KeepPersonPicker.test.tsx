import { render, screen, fireEvent } from '@testing-library/react'
import KeepPersonPicker from '#/components/KeepPersonPicker'
import { makePerson } from '#/test/fixtures'

describe('KeepPersonPicker', () => {
  const persons = [
    makePerson({ id: 10, display_name: 'Alice' }),
    makePerson({ id: 20, display_name: 'Bob' }),
  ]

  const defaultProps = {
    persons,
    onSelect: vi.fn(),
    onClose: vi.fn(),
  }

  it('opens dialog (showModal called)', () => {
    const showModal = vi.fn()
    HTMLDialogElement.prototype.showModal = showModal
    render(<KeepPersonPicker {...defaultProps} />)
    expect(showModal).toHaveBeenCalled()
  })

  it('lists persons', () => {
    render(<KeepPersonPicker {...defaultProps} />)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('calls onSelect with person id', () => {
    const onSelect = vi.fn()
    render(<KeepPersonPicker {...defaultProps} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Alice'))
    expect(onSelect).toHaveBeenCalledWith(10)
  })
})
