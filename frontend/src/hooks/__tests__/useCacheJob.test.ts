import { renderHook, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'
import { createWrapper } from '#/test/wrapper'
import { useCacheJob } from '#/hooks/useCacheJob'

describe('useCacheJob', () => {
  it('starts idle with no job', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'idle',
            total_items: 0,
            cached_items: 0,
            skipped_items: 0,
            failed_items: 0,
            bytes_cached: 0,
            flood_wait_until: null,
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof fetch

    const { result } = renderHook(() => useCacheJob(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.status?.status).toBe('idle'))
    expect(result.current.isRunning).toBe(false)
  })

  it('start triggers mutation and begins polling', async () => {
    let callCount = 0
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('/start')) {
        return new Response(
          JSON.stringify({
            status: 'running',
            total_items: 50,
            cached_items: 0,
            skipped_items: 10,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/status')) {
        callCount++
        return new Response(
          JSON.stringify({
            status: 'running',
            total_items: 50,
            cached_items: callCount * 5,
            skipped_items: 10,
            failed_items: 0,
            bytes_cached: callCount * 1000,
            flood_wait_until: null,
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useCacheJob(), {
      wrapper: createWrapper(),
    })

    act(() => result.current.start())

    await waitFor(() => expect(result.current.isRunning).toBe(true))
  })

  it('pause calls pause endpoint', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('/pause')) {
        return new Response(JSON.stringify({ status: 'paused' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/status')) {
        return new Response(
          JSON.stringify({
            status: 'running',
            total_items: 50,
            cached_items: 25,
            skipped_items: 0,
            failed_items: 0,
            bytes_cached: 5000,
            flood_wait_until: null,
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch
    globalThis.fetch = fetchMock

    const { result } = renderHook(() => useCacheJob(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.status).toBeDefined())
    act(() => result.current.pause())

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/pause'),
        expect.anything(),
      ),
    )
  })
})
