import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { makeGroup, makePerson } from '#/test/fixtures'
import ActiveGroupChips from '#/components/ActiveGroupChips'
import ViewModeHeader from '#/components/ViewModeHeader'
import PersonBreadcrumb from '#/components/PersonBreadcrumb'
import MediaToolbar from '#/components/MediaToolbar'
import PeopleToolbar from '#/components/PeopleToolbar'
import PersonMergeBar from '#/components/PersonMergeBar'

describe('ActiveGroupChips', () => {
  it('renders nothing when no active groups', () => {
    const { container } = render(
      <ActiveGroupChips
        groups={[makeGroup({ active: false })]}
        onToggle={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders chips for active groups', () => {
    const g1 = makeGroup({ name: 'Chat A', active: true })
    const g2 = makeGroup({ name: 'Chat B', active: true })
    render(
      <ActiveGroupChips
        groups={[g1, g2]}
        onToggle={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )
    expect(screen.getByText('Chat A')).toBeTruthy()
    expect(screen.getByText('Chat B')).toBeTruthy()
  })

  it('calls onToggle when chip clicked', () => {
    const onToggle = vi.fn()
    const g = makeGroup({ name: 'Chat A', active: true })
    render(
      <ActiveGroupChips
        groups={[g]}
        onToggle={onToggle}
        onDeselectAll={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Chat A'))
    expect(onToggle).toHaveBeenCalledWith(g)
  })
})

describe('ViewModeHeader', () => {
  it('renders nothing for normal mode', () => {
    const { container } = render(
      <ViewModeHeader viewMode="normal" onClose={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders Hidden Media for hidden mode', () => {
    render(<ViewModeHeader viewMode="hidden" onClose={vi.fn()} />)
    expect(screen.getByText('Hidden Media')).toBeTruthy()
  })

  it('renders Favorites for favorites mode', () => {
    render(<ViewModeHeader viewMode="favorites" onClose={vi.fn()} />)
    expect(screen.getByText('Favorites')).toBeTruthy()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<ViewModeHeader viewMode="hidden" onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Back to gallery'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('PersonBreadcrumb', () => {
  it('renders person name', () => {
    const person = makePerson({ name: 'Alice' })
    render(<PersonBreadcrumb person={person} onBack={vi.fn()} />)
    expect(screen.getByText('Alice')).toBeTruthy()
  })

  it('calls onBack when close clicked', () => {
    const onBack = vi.fn()
    render(<PersonBreadcrumb person={makePerson()} onBack={onBack} />)
    fireEvent.click(screen.getByLabelText('Back to people'))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('MediaToolbar', () => {
  const defaultProps = {
    itemCount: 42,
    totalCount: 100,
    hiddenCount: 5,
    favoritesCount: 10,
    viewMode: 'normal' as const,
    selectModeActive: false,
    onEnterSelectMode: vi.fn(),
    sortOrder: 'desc',
    onToggleSort: vi.fn(),
  }

  it('shows item count and total', () => {
    render(<MediaToolbar {...defaultProps} />)
    expect(screen.getByText(/42/)).toBeTruthy()
    expect(screen.getByText(/100/)).toBeTruthy()
  })

  it('select button has active style when selectMode active', () => {
    render(<MediaToolbar {...defaultProps} selectModeActive={true} />)
    const btn = screen.getByLabelText('Select mode')
    expect(btn.className).toContain('bg-accent/20')
  })

  it('calls onToggleSort when sort button clicked', () => {
    const onToggleSort = vi.fn()
    render(<MediaToolbar {...defaultProps} onToggleSort={onToggleSort} />)
    fireEvent.click(screen.getByLabelText('Newest first'))
    expect(onToggleSort).toHaveBeenCalled()
  })
})

describe('PeopleToolbar', () => {
  const defaultProps = {
    scanning: false,
    scanProgress: { scanned: 0, total: 0 },
    onStartScan: vi.fn(),
    similarityThreshold: 0.4,
    onThresholdChange: vi.fn(),
    mergeSelectActive: false,
    onEnterMergeSelect: vi.fn(),
    onDeselectAll: vi.fn(),
    onClose: vi.fn(),
  }

  it('shows Scan Faces button', () => {
    render(<PeopleToolbar {...defaultProps} />)
    expect(screen.getByText('Scan Faces')).toBeTruthy()
  })

  it('shows scanning progress when scanning', () => {
    render(
      <PeopleToolbar
        {...defaultProps}
        scanning={true}
        scanProgress={{ scanned: 5, total: 10 }}
      />,
    )
    expect(screen.getByText('Scanning... 5/10')).toBeTruthy()
  })

  it('hides Select button when merge select active', () => {
    render(<PeopleToolbar {...defaultProps} mergeSelectActive={true} />)
    expect(screen.queryByText('Select')).toBeNull()
    expect(screen.getByText('Deselect All')).toBeTruthy()
  })
})

describe('PersonMergeBar', () => {
  const defaultProps = {
    selectedCount: 3,
    merging: false,
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onMerge: vi.fn(),
    onExitSelectMode: vi.fn(),
    persons: [makePerson(), makePerson()],
  }

  it('shows selected count', () => {
    render(<PersonMergeBar {...defaultProps} />)
    expect(screen.getByText('3 selected')).toBeTruthy()
  })

  it('merge button disabled when less than 2 selected', () => {
    render(<PersonMergeBar {...defaultProps} selectedCount={1} />)
    const btn = screen.getByText('Merge')
    expect(btn).toBeDisabled()
  })

  it('merge button enabled when 2+ selected', () => {
    render(<PersonMergeBar {...defaultProps} />)
    const btn = screen.getByText('Merge')
    expect(btn).not.toBeDisabled()
  })

  it('shows Merging... when merging', () => {
    render(<PersonMergeBar {...defaultProps} merging={true} />)
    expect(screen.getByText('Merging...')).toBeTruthy()
  })
})
