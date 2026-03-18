import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '#/test/wrapper'
import { mockFetch } from '#/test/fetch-mock'
import { makeMediaItem, makeMediaPage } from '#/test/fixtures'
import { usePersonMedia } from '#/hooks/usePersonMedia'

describe('usePersonMedia', () => {
  it('fetches when enabled with personId', async () => {
    const items = [makeMediaItem(), makeMediaItem()]
    mockFetch({
      '/api/faces/persons/1/media': makeMediaPage(items),
    })

    const { result } = renderHook(() => usePersonMedia(1, true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(2))
  })

  it('does not fetch when disabled', async () => {
    const fetchFn = mockFetch({
      '/api/faces/persons/1/media': makeMediaPage([makeMediaItem()]),
    })

    renderHook(() => usePersonMedia(1, false), {
      wrapper: createWrapper(),
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('passes faces param in fetch URL', async () => {
    const items = [makeMediaItem()]
    const fetchFn = mockFetch({
      '/api/faces/persons/1/media': makeMediaPage(items),
    })

    const { result } = renderHook(
      () => usePersonMedia(1, true, 'desc', 'solo'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.items.length).toBe(1))
    const url = fetchFn.mock.calls[0][0] as string
    expect(url).toContain('faces=solo')
  })

  it('removeItems filters items from cache', async () => {
    const items = [makeMediaItem(), makeMediaItem(), makeMediaItem()]
    mockFetch({
      '/api/faces/persons/1/media': makeMediaPage(items),
    })

    const { result } = renderHook(() => usePersonMedia(1, true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.items.length).toBe(3))

    result.current.removeItems([items[0].id, items[2].id])

    await waitFor(() => expect(result.current.items.length).toBe(1))
    expect(result.current.items[0].id).toBe(items[1].id)
  })
})
