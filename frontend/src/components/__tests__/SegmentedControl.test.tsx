import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from '#/components/SegmentedControl'

const options = [
  { label: 'All', value: null },
  { label: 'Photos', value: 'photo' },
  { label: 'Videos', value: 'video' },
]

describe('SegmentedControl', () => {
  it('renders all options', () => {
    render(
      <SegmentedControl
        options={options}
        value={null}
        onChange={() => {}}
        label="Media type filter"
      />,
    )
    expect(screen.getByText('All')).toBeTruthy()
    expect(screen.getByText('Photos')).toBeTruthy()
    expect(screen.getByText('Videos')).toBeTruthy()
  })

  it('applies active styling to selected option', () => {
    render(
      <SegmentedControl
        options={options}
        value="photo"
        onChange={() => {}}
        label="Media type filter"
      />,
    )
    const active = screen.getByText('Photos')
    expect(active.className).toContain('bg-surface-strong')
    expect(active.className).toContain('text-text')
  })

  it('applies inactive styling to unselected options', () => {
    render(
      <SegmentedControl
        options={options}
        value="photo"
        onChange={() => {}}
        label="Media type filter"
      />,
    )
    const inactive = screen.getByText('All')
    expect(inactive.className).toContain('text-text-soft')
    expect(inactive.className).not.toContain('bg-surface-strong')
  })

  it('calls onChange when an option is clicked', async () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        options={options}
        value={null}
        onChange={onChange}
        label="Media type filter"
      />,
    )
    await userEvent.click(screen.getByText('Videos'))
    expect(onChange).toHaveBeenCalledWith('video')
  })

  it('has role=group and aria-label', () => {
    render(
      <SegmentedControl
        options={options}
        value={null}
        onChange={() => {}}
        label="Media type filter"
      />,
    )
    const group = screen.getByRole('group', { name: 'Media type filter' })
    expect(group).toBeTruthy()
  })

  it('marks active button with aria-pressed', () => {
    render(
      <SegmentedControl
        options={options}
        value="photo"
        onChange={() => {}}
        label="Media type filter"
      />,
    )
    expect(screen.getByText('Photos').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('All').getAttribute('aria-pressed')).toBe('false')
  })
})
