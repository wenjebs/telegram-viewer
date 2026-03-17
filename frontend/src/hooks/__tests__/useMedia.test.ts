import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '#/test/wrapper'
import { mockFetch } from '#/test/fetch-mock'
import { makeMediaItem, makeMediaPage } from '#/test/fixtures'
import { useMedia } from '#/hooks/useMedia'

describe('useMedia', () => {
  it('returns empty items when loading', () => {
    mockFetch({ '/api/media': makeMediaPage([]) })
    const { result } = renderHook(() => useMedia({}), {
      wrapper: createWrapper(),
    })
    expect(result.current.items).toEqual([])
  })

  it('fetches first page with filters', async () => {
    const items = [makeMediaItem(), makeMediaItem()]
    mockFetch({ '/api/media': makeMediaPage(items) })

    const { result } = renderHook(
      () => useMedia({ groups: [1], type: 'photo' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.items.length).toBe(2))
    expect(result.current.items[0].id).toBe(items[0].id)
  })

  it('reports hasMore when next_cursor present', async () => {
    mockFetch({
      '/api/media': makeMediaPage([makeMediaItem()], 'cursor_abc'),
    })

    const { result } = renderHook(() => useMedia({}), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.hasMore).toBe(true))
  })

  it('reports no hasMore when next_cursor null', async () => {
    mockFetch({
      '/api/media': makeMediaPage([makeMediaItem()], null),
    })

    const { result } = renderHook(() => useMedia({}), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(1))
    expect(result.current.hasMore).toBe(false)
  })

  it('removeItem filters out item from cache', async () => {
    const items = [makeMediaItem(), makeMediaItem(), makeMediaItem()]
    mockFetch({ '/api/media': makeMediaPage(items) })

    const { result } = renderHook(() => useMedia({}), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(3))

    const removeId = items[1].id
    result.current.removeItem(removeId)

    await waitFor(() => expect(result.current.items.length).toBe(2))
    expect(result.current.items.find((i) => i.id === removeId)).toBeUndefined()
  })

  it('removeItems batch removal', async () => {
    const items = [makeMediaItem(), makeMediaItem(), makeMediaItem()]
    mockFetch({ '/api/media': makeMediaPage(items) })

    const { result } = renderHook(() => useMedia({}), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(3))

    result.current.removeItems([items[0].id, items[2].id])

    await waitFor(() => expect(result.current.items.length).toBe(1))
    expect(result.current.items[0].id).toBe(items[1].id)
  })

  it('disabled when enabled=false', async () => {
    const fetchFn = mockFetch({
      '/api/media': makeMediaPage([makeMediaItem()]),
    })

    renderHook(() => useMedia({}, false), {
      wrapper: createWrapper(),
    })

    // Wait a tick to ensure no fetch happened
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
