import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '#/test/wrapper'
import { mockFetch } from '#/test/fetch-mock'
import { makeMediaItem, makeMediaPage } from '#/test/fixtures'
import { useHiddenMedia } from '#/hooks/useHiddenMedia'

describe('useHiddenMedia', () => {
  it('fetches when enabled', async () => {
    const items = [makeMediaItem(), makeMediaItem()]
    mockFetch({
      '/api/media/hidden': makeMediaPage(items),
    })

    const { result } = renderHook(() => useHiddenMedia(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(2))
  })

  it('does not fetch when disabled', async () => {
    const fetchFn = mockFetch({
      '/api/media/hidden': makeMediaPage([makeMediaItem()]),
    })

    renderHook(() => useHiddenMedia(false), {
      wrapper: createWrapper(),
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('removeItems filters items from cache', async () => {
    const items = [makeMediaItem(), makeMediaItem(), makeMediaItem()]
    mockFetch({
      '/api/media/hidden': makeMediaPage(items),
    })

    const { result } = renderHook(() => useHiddenMedia(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(3))

    result.current.removeItems([items[0].id, items[2].id])

    await waitFor(() => expect(result.current.items.length).toBe(1))
    expect(result.current.items[0].id).toBe(items[1].id)
  })
})
