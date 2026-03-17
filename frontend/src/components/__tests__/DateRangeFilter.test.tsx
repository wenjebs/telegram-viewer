import { render, screen, fireEvent } from '@testing-library/react'
import DateRangeFilter from '#/components/DateRangeFilter'

// Mock react-day-picker to avoid complex calendar rendering
vi.mock('react-day-picker', () => ({
  DayPicker: () => <div data-testid="day-picker" />,
}))

describe('DateRangeFilter', () => {
  it('starts collapsed', () => {
    render(
      <DateRangeFilter dateRange={undefined} onDateRangeChange={vi.fn()} />,
    )
    expect(screen.getByText('Date Range')).toBeTruthy()
    expect(screen.queryByTestId('day-picker')).toBeNull()
  })

  it('shows Clear when dateRange is set', () => {
    const dateRange = { from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) }
    render(
      <DateRangeFilter dateRange={dateRange} onDateRangeChange={vi.fn()} />,
    )
    expect(screen.getByText('Clear')).toBeTruthy()
  })

  it('calls onDateRangeChange(undefined) on Clear', () => {
    const onDateRangeChange = vi.fn()
    const dateRange = { from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) }
    render(
      <DateRangeFilter
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
      />,
    )
    fireEvent.click(screen.getByText('Clear'))
    expect(onDateRangeChange).toHaveBeenCalledWith(undefined)
  })
})
