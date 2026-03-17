import { renderHook, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'
import { createWrapper } from '#/test/wrapper'
import { useFaceScan } from '#/hooks/useFaceScan'

describe('useFaceScan', () => {
  it('starts with scanning=false', () => {
    // scan-status returns idle
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'idle',
            scanned: 0,
            total: 0,
            person_count: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof fetch

    const { result } = renderHook(
      () => useFaceScan({ onScanComplete: vi.fn() }),
      { wrapper: createWrapper() },
    )
    expect(result.current.scanning).toBe(false)
  })

  it('startScan triggers mutation and sets scanning', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('/faces/scan?')) {
        return new Response(JSON.stringify({ started: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // scan-status: return scanning
      return new Response(
        JSON.stringify({
          status: 'scanning',
          scanned: 0,
          total: 10,
          person_count: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    const { result } = renderHook(
      () => useFaceScan({ onScanComplete: vi.fn() }),
      { wrapper: createWrapper() },
    )

    act(() => result.current.startScan(false))

    await waitFor(() => expect(result.current.scanning).toBe(true))
  })

  it('calls onScanComplete when done', async () => {
    const onScanComplete = vi.fn()
    let statusCallCount = 0

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('/faces/scan?') && !url.includes('scan-status')) {
        return new Response(JSON.stringify({ started: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('scan-status')) {
        statusCallCount++
        // First call returns scanning, subsequent calls return done
        const status =
          statusCallCount <= 1
            ? { status: 'scanning', scanned: 5, total: 10, person_count: 0 }
            : { status: 'done', scanned: 10, total: 10, person_count: 3 }
        return new Response(JSON.stringify(status), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useFaceScan({ onScanComplete }), {
      wrapper: createWrapper(),
    })

    // The initial scan-status query will return 'scanning', which triggers scanning=true via useEffect
    await waitFor(() => expect(result.current.scanning).toBe(true))

    // Then next poll returns 'done', which triggers onScanComplete
    await waitFor(() => expect(onScanComplete).toHaveBeenCalled(), {
      timeout: 5000,
    })
    await waitFor(() => expect(result.current.scanning).toBe(false))
  })

  it('resumes scanning if status shows in-progress on mount', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'scanning',
            scanned: 5,
            total: 10,
            person_count: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof fetch

    const { result } = renderHook(
      () => useFaceScan({ onScanComplete: vi.fn() }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.scanning).toBe(true))
  })

  it('provides default status when no data yet', () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'idle',
            scanned: 0,
            total: 0,
            person_count: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof fetch

    const { result } = renderHook(
      () => useFaceScan({ onScanComplete: vi.fn() }),
      { wrapper: createWrapper() },
    )

    expect(result.current.status).toEqual({
      status: 'idle',
      scanned: 0,
      total: 0,
      person_count: 0,
    })
  })
})
