import { render, screen, fireEvent } from '@testing-library/react'
import CrossPersonWarningModal from '#/components/CrossPersonWarningModal'

describe('CrossPersonWarningModal', () => {
  const conflicts = [
    {
      media_id: 1,
      persons: [
        { id: 10, display_name: 'Alice' },
        { id: 20, display_name: 'Bob' },
      ],
    },
    {
      media_id: 2,
      persons: [{ id: 10, display_name: 'Alice' }],
    },
  ]

  it('shows affected persons with photo counts', () => {
    render(
      <CrossPersonWarningModal
        conflicts={conflicts}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Alice/)).toBeTruthy()
    expect(screen.getByText(/Bob/)).toBeTruthy()
  })

  it('calls onConfirm when Hide anyway clicked', () => {
    const onConfirm = vi.fn()
    render(
      <CrossPersonWarningModal
        conflicts={conflicts}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Hide anyway'))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('calls onCancel when Cancel clicked', () => {
    const onCancel = vi.fn()
    render(
      <CrossPersonWarningModal
        conflicts={conflicts}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })
})
