import { renderHook, act } from '@testing-library/react'
import { useSelectMode } from '#/hooks/useSelectMode'

describe('useSelectMode', () => {
  it('starts inactive with empty selection', () => {
    const { result } = renderHook(() => useSelectMode())
    expect(result.current.active).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.selectedCount).toBe(0)
  })

  it('enterSelectMode activates without initialId', () => {
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode())
    expect(result.current.active).toBe(true)
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('enterSelectMode activates with initialId', () => {
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode(42))
    expect(result.current.active).toBe(true)
    expect(result.current.selectedIds.has(42)).toBe(true)
    expect(result.current.selectedCount).toBe(1)
  })

  it('exitSelectMode deactivates and clears', () => {
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode(1))
    act(() => result.current.exitSelectMode())
    expect(result.current.active).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('toggle adds id when not selected', () => {
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode())
    act(() => result.current.toggle(5))
    expect(result.current.isSelected(5)).toBe(true)
  })

  it('toggle removes id when already selected', () => {
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode(5))
    act(() => result.current.toggle(5))
    expect(result.current.isSelected(5)).toBe(false)
  })

  it('toggleRange selects range from anchor to target', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode())
    // Set anchor by toggling id 2
    act(() => result.current.toggle(2))
    // Range select to id 4
    act(() => result.current.toggleRange(4, items))
    expect(result.current.isSelected(2)).toBe(true)
    expect(result.current.isSelected(3)).toBe(true)
    expect(result.current.isSelected(4)).toBe(true)
    expect(result.current.isSelected(1)).toBe(false)
    expect(result.current.isSelected(5)).toBe(false)
  })

  it('toggleRange falls back to toggle when no anchor', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode())
    // No prior toggle, so no anchor
    act(() => result.current.toggleRange(2, items))
    expect(result.current.isSelected(2)).toBe(true)
    expect(result.current.selectedCount).toBe(1)
  })

  it('selectAll selects all items', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode())
    act(() => result.current.selectAll(items))
    expect(result.current.selectedCount).toBe(3)
    expect(result.current.isSelected(1)).toBe(true)
    expect(result.current.isSelected(2)).toBe(true)
    expect(result.current.isSelected(3)).toBe(true)
  })

  it('selectDateGroup adds all when not all selected', () => {
    const group = [{ id: 2 }, { id: 3 }]
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode(1))
    act(() => result.current.selectDateGroup(group))
    expect(result.current.isSelected(1)).toBe(true)
    expect(result.current.isSelected(2)).toBe(true)
    expect(result.current.isSelected(3)).toBe(true)
  })

  it('selectDateGroup removes all when all selected', () => {
    const group = [{ id: 2 }, { id: 3 }]
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode())
    act(() => result.current.toggle(2))
    act(() => result.current.toggle(3))
    // Now both are selected, selectDateGroup should remove them
    act(() => result.current.selectDateGroup(group))
    expect(result.current.isSelected(2)).toBe(false)
    expect(result.current.isSelected(3)).toBe(false)
  })

  it('deselectAll clears selection', () => {
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode(1))
    act(() => result.current.toggle(2))
    act(() => result.current.deselectAll())
    expect(result.current.selectedCount).toBe(0)
  })

  it('isSelected returns correct boolean', () => {
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode(10))
    expect(result.current.isSelected(10)).toBe(true)
    expect(result.current.isSelected(99)).toBe(false)
  })

  it('selectedCount reflects set size', () => {
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode())
    act(() => result.current.toggle(1))
    act(() => result.current.toggle(2))
    act(() => result.current.toggle(3))
    expect(result.current.selectedCount).toBe(3)
    act(() => result.current.toggle(2))
    expect(result.current.selectedCount).toBe(2)
  })

  it('setSelection replaces selection', () => {
    const { result } = renderHook(() => useSelectMode())
    act(() => result.current.enterSelectMode(1))
    act(() => result.current.setSelection(new Set([10, 20, 30])))
    expect(result.current.selectedCount).toBe(3)
    expect(result.current.isSelected(1)).toBe(false)
    expect(result.current.isSelected(10)).toBe(true)
    expect(result.current.isSelected(20)).toBe(true)
    expect(result.current.isSelected(30)).toBe(true)
  })

  it('setAnchor sets the anchor without modifying selectedIds', () => {
    const { result } = renderHook(() => useSelectMode())

    act(() => result.current.setAnchor(5))

    // selectedIds should still be empty
    expect(result.current.selectedIds.size).toBe(0)

    // Now shift-click (toggleRange) should use 5 as anchor
    const items = [
      { id: 3 },
      { id: 5 },
      { id: 7 },
      { id: 9 },
    ]
    act(() => result.current.toggleRange(9, items))

    // Should select range from 5 to 9: ids 5, 7, 9
    expect(result.current.selectedIds).toEqual(new Set([5, 7, 9]))
  })
})
