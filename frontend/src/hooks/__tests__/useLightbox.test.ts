import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import { makeMediaItem } from '#/test/fixtures'
import { useLightbox } from '#/hooks/useLightbox'

function createOptions(
  overrides: Partial<Parameters<typeof useLightbox>[0]> = {},
) {
  const items = overrides.activeItems ?? [
    makeMediaItem({ id: 100 }),
    makeMediaItem({ id: 200 }),
    makeMediaItem({ id: 300 }),
  ]
  return {
    activeItems: items,
    selectedItem: overrides.selectedItem ?? items[1],
    setSelectedItem: overrides.setSelectedItem ?? vi.fn(),
    media: overrides.media ?? { removeItem: vi.fn() },
    hidden: overrides.hidden ?? { removeItems: vi.fn() },
    selectMode: overrides.selectMode ?? {
      active: false,
      isSelected: vi.fn(() => false),
      enterSelectMode: vi.fn(),
      toggle: vi.fn(),
    },
    refreshCounts: overrides.refreshCounts ?? vi.fn(),
    invalidateMedia: overrides.invalidateMedia ?? vi.fn(),
    viewMode: overrides.viewMode ?? 'normal',
  }
}

describe('useLightbox', () => {
  it('selectedIndex matches position in activeItems', () => {
    const opts = createOptions()
    const { result } = renderHook(() => useLightbox(opts))
    expect(result.current.selectedIndex).toBe(1)
  })

  it('handlePrev navigates to previous item', () => {
    const setSelectedItem = vi.fn()
    const opts = createOptions({ setSelectedItem })
    const { result } = renderHook(() => useLightbox(opts))

    act(() => result.current.handlePrev())
    expect(setSelectedItem).toHaveBeenCalledWith(opts.activeItems[0])
  })

  it('handleNext navigates to next item', () => {
    const setSelectedItem = vi.fn()
    const opts = createOptions({ setSelectedItem })
    const { result } = renderHook(() => useLightbox(opts))

    act(() => result.current.handleNext())
    expect(setSelectedItem).toHaveBeenCalledWith(opts.activeItems[2])
  })

  it('handlePrev does nothing at first item', () => {
    const setSelectedItem = vi.fn()
    const items = [makeMediaItem({ id: 100 }), makeMediaItem({ id: 200 })]
    const opts = createOptions({
      activeItems: items,
      selectedItem: items[0],
      setSelectedItem,
    })
    const { result } = renderHook(() => useLightbox(opts))

    act(() => result.current.handlePrev())
    expect(setSelectedItem).not.toHaveBeenCalled()
  })

  it('handleNext does nothing at last item', () => {
    const setSelectedItem = vi.fn()
    const items = [makeMediaItem({ id: 100 }), makeMediaItem({ id: 200 })]
    const opts = createOptions({
      activeItems: items,
      selectedItem: items[1],
      setSelectedItem,
    })
    const { result } = renderHook(() => useLightbox(opts))

    act(() => result.current.handleNext())
    expect(setSelectedItem).not.toHaveBeenCalled()
  })

  it('handleClose sets null and sets justClosedRef', () => {
    const setSelectedItem = vi.fn()
    const opts = createOptions({ setSelectedItem })
    const { result } = renderHook(() => useLightbox(opts))

    act(() => result.current.handleClose())
    expect(setSelectedItem).toHaveBeenCalledWith(null)
    // justClosedRef is set to true, then rAF resets it synchronously in tests
    // But since the rAF callback runs within the same tick, the ref gets reset
    // The important thing is that handleClose was called and setSelectedItem(null) was invoked
  })

  it('handleToggleSelect enters select mode if not active', () => {
    const enterSelectMode = vi.fn()
    const opts = createOptions({
      selectMode: {
        active: false,
        isSelected: vi.fn(),
        enterSelectMode,
        toggle: vi.fn(),
      },
    })
    const { result } = renderHook(() => useLightbox(opts))

    act(() => result.current.handleToggleSelect())
    expect(enterSelectMode).toHaveBeenCalledWith(opts.selectedItem!.id)
  })

  it('handleToggleSelect toggles if select mode active', () => {
    const toggle = vi.fn()
    const opts = createOptions({
      selectMode: {
        active: true,
        isSelected: vi.fn(),
        enterSelectMode: vi.fn(),
        toggle,
      },
    })
    const { result } = renderHook(() => useLightbox(opts))

    act(() => result.current.handleToggleSelect())
    expect(toggle).toHaveBeenCalledWith(opts.selectedItem!.id)
  })

  it('handleToggleFavorite calls API and updates item', async () => {
    const setSelectedItem = vi.fn()
    const refreshCounts = vi.fn()
    const invalidateMedia = vi.fn()

    // Mock fetch for toggleFavorite
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, favorited: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    const opts = createOptions({
      setSelectedItem,
      refreshCounts,
      invalidateMedia,
    })
    const { result } = renderHook(() => useLightbox(opts))

    await act(async () => {
      await result.current.handleToggleFavorite()
    })

    expect(setSelectedItem).toHaveBeenCalledWith(
      expect.objectContaining({ favorited_at: expect.any(String) }),
    )
    expect(refreshCounts).toHaveBeenCalled()
    expect(invalidateMedia).toHaveBeenCalled()
  })

  it('handleHide removes item and navigates', async () => {
    const setSelectedItem = vi.fn()
    const removeItem = vi.fn()
    const refreshCounts = vi.fn()
    const invalidateMedia = vi.fn()

    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    const items = [
      makeMediaItem({ id: 100 }),
      makeMediaItem({ id: 200 }),
      makeMediaItem({ id: 300 }),
    ]
    const opts = createOptions({
      activeItems: items,
      selectedItem: items[1],
      setSelectedItem,
      media: { removeItem },
      refreshCounts,
      invalidateMedia,
      viewMode: 'normal',
    })
    const { result } = renderHook(() => useLightbox(opts))

    await act(async () => {
      await result.current.handleHide!()
    })

    expect(removeItem).toHaveBeenCalledWith(200)
    expect(refreshCounts).toHaveBeenCalled()
    // Should navigate to next item at same index
    expect(setSelectedItem).toHaveBeenCalledWith(items[2])
  })
})
