import { render, screen } from '@testing-library/react'
import DateHeader from '#/components/DateHeader'

describe('DateHeader', () => {
  it('renders formatted date', () => {
    render(<DateHeader date="2026-01-15" />)
    const text = screen.getByRole('heading').textContent
    expect(text).toContain('January')
    expect(text).toContain('15')
    expect(text).toContain('2026')
  })
})
