import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SkeletonGroup from '../SkeletonGroup'

describe('SkeletonGroup', () => {
  it('renders the expected number of skeleton cells', () => {
    const { container } = render(<SkeletonGroup columns={4} rows={2} />)
    const cells = container.querySelectorAll('[data-testid="skeleton-cell"]')
    expect(cells).toHaveLength(8)
  })

  it('renders a skeleton header bar', () => {
    render(<SkeletonGroup columns={3} rows={1} />)
    expect(screen.getByTestId('skeleton-header')).toBeInTheDocument()
  })

  it('applies shimmer animation via inline style', () => {
    const { container } = render(<SkeletonGroup columns={2} rows={1} />)
    const cell = container.querySelector(
      '[data-testid="skeleton-cell"]',
    ) as HTMLElement
    expect(cell?.style.animation).toContain('shimmer')
  })
})
