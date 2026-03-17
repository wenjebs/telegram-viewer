import { render, screen, fireEvent } from '@testing-library/react'
import PeopleGrid from '#/components/PeopleGrid'
import { makePerson } from '#/test/fixtures'

describe('PeopleGrid', () => {
  it('renders loading state', () => {
    render(<PeopleGrid persons={[]} loading onPersonClick={vi.fn()} />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('renders empty state', () => {
    render(<PeopleGrid persons={[]} loading={false} onPersonClick={vi.fn()} />)
    expect(screen.getByText(/No people found/)).toBeTruthy()
  })

  it('renders person cards with names', () => {
    const persons = [
      makePerson({ display_name: 'Alice' }),
      makePerson({ display_name: 'Bob' }),
    ]
    render(
      <PeopleGrid persons={persons} loading={false} onPersonClick={vi.fn()} />,
    )
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('calls onPersonClick when a person is clicked', () => {
    const onPersonClick = vi.fn()
    const person = makePerson({ display_name: 'Charlie' })
    render(
      <PeopleGrid
        persons={[person]}
        loading={false}
        onPersonClick={onPersonClick}
      />,
    )
    fireEvent.click(screen.getByText('Charlie'))
    expect(onPersonClick).toHaveBeenCalledWith(person)
  })

  it('shows select checkbox in select mode', () => {
    const person = makePerson()
    const { container } = render(
      <PeopleGrid
        persons={[person]}
        loading={false}
        onPersonClick={vi.fn()}
        selectMode
        selectedIds={new Set()}
        onToggle={vi.fn()}
      />,
    )
    const checkbox = container.querySelector('.rounded-full.border-2')
    expect(checkbox).toBeTruthy()
  })

  it('shows face count', () => {
    const person = makePerson({ face_count: 5 })
    render(
      <PeopleGrid persons={[person]} loading={false} onPersonClick={vi.fn()} />,
    )
    expect(screen.getByText('5 photos')).toBeTruthy()
  })
})
