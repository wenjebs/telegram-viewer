import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '#/test/wrapper'
import { mockFetch } from '#/test/fetch-mock'
import { makeMediaItem, makeMediaPage } from '#/test/fixtures'
import { useFavoritesMedia } from '#/hooks/useFavoritesMedia'

describe('useFavoritesMedia', () => {
  it('fetches when enabled', async () => {
    const items = [makeMediaItem(), makeMediaItem()]
    mockFetch({
      '/api/media/favorites': makeMediaPage(items),
    })

    const { result } = renderHook(() => useFavoritesMedia(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(2))
  })

  it('removeItems filters items from cache', async () => {
    const items = [makeMediaItem(), makeMediaItem(), makeMediaItem()]
    mockFetch({
      '/api/media/favorites': makeMediaPage(items),
    })

    const { result } = renderHook(() => useFavoritesMedia(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(3))

    result.current.removeItems([items[1].id])

    await waitFor(() => expect(result.current.items.length).toBe(2))
  })
})
