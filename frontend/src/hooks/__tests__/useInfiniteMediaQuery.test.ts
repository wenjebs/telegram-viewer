import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '#/test/wrapper'
import { mockFetch } from '#/test/fetch-mock'
import { makeMediaItem, makeMediaPage } from '#/test/fixtures'
import { useInfiniteMediaQuery } from '#/hooks/useInfiniteMediaQuery'
import type { MediaPage } from '#/api/schemas'

const TEST_URL = '/api/test-media'

function useTestHook(enabled = true) {
  return useInfiniteMediaQuery(
    ['test-media'],
    async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (pageParam) params.set('cursor', pageParam)
      const res = await fetch(`${TEST_URL}?${params}`)
      return (await res.json()) as MediaPage
    },
    enabled,
  )
}

describe('useInfiniteMediaQuery', () => {
  it('returns empty items when loading', () => {
    mockFetch({ [TEST_URL]: makeMediaPage([]) })
    const { result } = renderHook(() => useTestHook(), {
      wrapper: createWrapper(),
    })
    expect(result.current.items).toEqual([])
  })

  it('fetches and flattens items from pages', async () => {
    const items = [makeMediaItem(), makeMediaItem()]
    mockFetch({ [TEST_URL]: makeMediaPage(items) })

    const { result } = renderHook(() => useTestHook(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(2))
    expect(result.current.items[0].id).toBe(items[0].id)
    expect(result.current.items[1].id).toBe(items[1].id)
  })

  it('hasMore is true when next_cursor present', async () => {
    mockFetch({
      [TEST_URL]: makeMediaPage([makeMediaItem()], 'cursor_abc'),
    })

    const { result } = renderHook(() => useTestHook(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.hasMore).toBe(true))
  })

  it('hasMore is false when next_cursor null', async () => {
    mockFetch({
      [TEST_URL]: makeMediaPage([makeMediaItem()], null),
    })

    const { result } = renderHook(() => useTestHook(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(1))
    expect(result.current.hasMore).toBe(false)
  })

  it('removeItem optimistically removes single item', async () => {
    const items = [makeMediaItem(), makeMediaItem(), makeMediaItem()]
    mockFetch({ [TEST_URL]: makeMediaPage(items) })

    const { result } = renderHook(() => useTestHook(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(3))

    const removeId = items[1].id
    result.current.removeItem(removeId)

    await waitFor(() => expect(result.current.items.length).toBe(2))
    expect(result.current.items.find((i) => i.id === removeId)).toBeUndefined()
  })

  it('removeItems optimistically removes multiple items', async () => {
    const items = [makeMediaItem(), makeMediaItem(), makeMediaItem()]
    mockFetch({ [TEST_URL]: makeMediaPage(items) })

    const { result } = renderHook(() => useTestHook(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(3))

    result.current.removeItems([items[0].id, items[2].id])

    await waitFor(() => expect(result.current.items.length).toBe(1))
    expect(result.current.items[0].id).toBe(items[1].id)
  })

  it('does not fetch when enabled=false', async () => {
    const fetchFn = mockFetch({
      [TEST_URL]: makeMediaPage([makeMediaItem()]),
    })

    renderHook(() => useTestHook(false), {
      wrapper: createWrapper(),
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
