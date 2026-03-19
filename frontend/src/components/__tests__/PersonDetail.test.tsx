import { render, screen, fireEvent } from '@testing-library/react'
import PersonDetail from '#/components/PersonDetail'
import { makePerson } from '#/test/fixtures'

// Mock lucide-react
vi.mock('lucide-react', () => ({
  ArrowLeft: (props: Record<string, unknown>) => (
    <svg data-testid="arrow-left" {...props} />
  ),
}))

describe('PersonDetail', () => {
  const person = makePerson({
    display_name: 'Alice',
    face_count: 7,
  })

  const defaultProps = {
    person,
    onBack: vi.fn(),
    onRename: vi.fn(),
    onMerge: vi.fn(),
    onDelete: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders person name and count', () => {
    render(<PersonDetail {...defaultProps} />)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('7 photos')).toBeTruthy()
  })

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn()
    render(<PersonDetail {...defaultProps} onBack={onBack} />)
    fireEvent.click(screen.getByTestId('arrow-left').closest('button')!)
    expect(onBack).toHaveBeenCalled()
  })

  it('enters edit mode on name click', () => {
    render(<PersonDetail {...defaultProps} />)
    fireEvent.click(screen.getByText('Alice'))
    // Input should appear with the current name
    const input = screen.getByDisplayValue('Alice')
    expect(input).toBeTruthy()
  })

  it('calls onRename on Enter', () => {
    const onRename = vi.fn()
    render(<PersonDetail {...defaultProps} onRename={onRename} />)
    fireEvent.click(screen.getByText('Alice'))
    const input = screen.getByDisplayValue('Alice')
    fireEvent.change(input, { target: { value: 'Bob' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('Bob')
  })

  it('cancels edit on Escape', () => {
    render(<PersonDetail {...defaultProps} />)
    fireEvent.click(screen.getByText('Alice'))
    const input = screen.getByDisplayValue('Alice')
    fireEvent.change(input, { target: { value: 'Bob' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    // Should show original name, not input
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByDisplayValue('Bob')).toBeNull()
  })

  it('renders delete button', () => {
    render(<PersonDetail {...defaultProps} />)
    expect(screen.getByText('Delete')).toBeTruthy()
  })

  it('shows confirmation dialog on delete click', () => {
    render(<PersonDetail {...defaultProps} />)
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByText(/Delete Alice\?/)).toBeTruthy()
  })

  it('calls onDelete on confirm', () => {
    const onDelete = vi.fn()
    render(<PersonDetail {...defaultProps} onDelete={onDelete} />)
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByText('Delete person'))
    expect(onDelete).toHaveBeenCalled()
  })

  it('hides dialog on cancel', () => {
    render(<PersonDetail {...defaultProps} />)
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText(/Delete Alice\?/)).toBeNull()
  })
})
