import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import { usePersonMerge } from '#/hooks/usePersonMerge'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Must import after mock setup
import { toast } from 'sonner'

describe('usePersonMerge', () => {
  it('starts with showKeeperPicker=false', () => {
    const { result } = renderHook(() => usePersonMerge(vi.fn()))
    expect(result.current.showKeeperPicker).toBe(false)
    expect(result.current.merging).toBe(false)
  })

  it('openKeeperPicker/closeKeeperPicker toggle', () => {
    const { result } = renderHook(() => usePersonMerge(vi.fn()))

    act(() => result.current.openKeeperPicker())
    expect(result.current.showKeeperPicker).toBe(true)

    act(() => result.current.closeKeeperPicker())
    expect(result.current.showKeeperPicker).toBe(false)
  })

  it('executeMerge calls batch API', async () => {
    const invalidatePersons = vi.fn()
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    const { result } = renderHook(() => usePersonMerge(invalidatePersons))

    // Select some persons
    act(() => result.current.selectMode.enterSelectMode(1))
    act(() => result.current.selectMode.toggle(2))
    act(() => result.current.selectMode.toggle(3))

    await act(async () => {
      await result.current.executeMerge(1)
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('merge-batch'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(invalidatePersons).toHaveBeenCalled()
  })

  it('executeMerge shows toast on success', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    const { result } = renderHook(() => usePersonMerge(vi.fn()))

    act(() => result.current.selectMode.enterSelectMode(1))
    act(() => result.current.selectMode.toggle(2))

    await act(async () => {
      await result.current.executeMerge(1)
    })

    expect(toast.success).toHaveBeenCalledWith('Merged 1 person')
  })

  it('executeMerge does nothing when no merge ids', async () => {
    const fetchFn = vi.fn()
    globalThis.fetch = fetchFn as unknown as typeof fetch

    const { result } = renderHook(() => usePersonMerge(vi.fn()))

    // Only select the keep id
    act(() => result.current.selectMode.enterSelectMode(1))

    await act(async () => {
      await result.current.executeMerge(1)
    })

    // No API call should be made since mergeIds would be empty
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
