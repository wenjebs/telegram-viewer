import { renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { createWrapper } from '#/test/wrapper'
import { makeMediaItem } from '#/test/fixtures'
import { usePrefetch } from '#/hooks/usePrefetch'

describe('usePrefetch', () => {
  it('prefetches when enabled', async () => {
    const fetchFn = vi.fn(
      async () => new Response('', { status: 200 }),
    ) as unknown as typeof fetch
    globalThis.fetch = fetchFn

    const items = [makeMediaItem(), makeMediaItem()]
    renderHook(() => usePrefetch(items, true), {
      wrapper: createWrapper(),
    })

    // Give time for prefetch to start
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchFn).toHaveBeenCalled()
  })

  it('does not prefetch when disabled', async () => {
    const fetchFn = vi.fn(
      async () => new Response('', { status: 200 }),
    ) as unknown as typeof fetch
    globalThis.fetch = fetchFn

    const items = [makeMediaItem(), makeMediaItem()]
    renderHook(() => usePrefetch(items, false), {
      wrapper: createWrapper(),
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('aborts on unmount', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')

    const fetchFn = vi.fn(
      async () => new Response('', { status: 200 }),
    ) as unknown as typeof fetch
    globalThis.fetch = fetchFn

    const items = [makeMediaItem()]
    const { unmount } = renderHook(() => usePrefetch(items, true), {
      wrapper: createWrapper(),
    })

    await new Promise((r) => setTimeout(r, 50))

    unmount()
    expect(abortSpy).toHaveBeenCalled()

    abortSpy.mockRestore()
  })

  it('does not re-prefetch already cached items', async () => {
    const mockFn = vi.fn(async () => new Response('', { status: 200 }))
    globalThis.fetch = mockFn as unknown as typeof fetch

    const initialItems = [makeMediaItem()]
    const { rerender } = renderHook(
      ({ items, enabled }) => usePrefetch(items, enabled),
      {
        wrapper: createWrapper(),
        initialProps: { items: initialItems, enabled: true },
      },
    )

    await new Promise((r) => setTimeout(r, 50))
    const firstCallCount = mockFn.mock.calls.length

    // Rerender with same items
    rerender({ items: initialItems, enabled: true })
    await new Promise((r) => setTimeout(r, 50))

    // Should not have made additional fetch calls for same items
    expect(mockFn.mock.calls.length).toBe(firstCallCount)
  })
})
