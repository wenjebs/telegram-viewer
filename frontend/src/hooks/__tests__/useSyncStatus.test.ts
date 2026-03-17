import { renderHook, waitFor, act } from '@testing-library/react'
import { createWrapper } from '#/test/wrapper'
import { useSyncStatus } from '#/hooks/useSyncStatus'

describe('useSyncStatus', () => {
  it('starts with syncing=false', () => {
    const { result } = renderHook(
      () => useSyncStatus({ onSyncComplete: vi.fn() }),
      { wrapper: createWrapper() },
    )
    expect(result.current.syncing).toBe(false)
  })

  it('handleSync sets syncing groups', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('sync-all')) {
        return new Response(JSON.stringify({ started: [1, 2] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('sync-status')) {
        return new Response(
          JSON.stringify({ status: 'syncing', progress: 0, total: 10 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch

    const { result } = renderHook(
      () => useSyncStatus({ onSyncComplete: vi.fn() }),
      { wrapper: createWrapper() },
    )

    act(() => result.current.handleSync([1, 2]))

    await waitFor(() => expect(result.current.syncing).toBe(true))
  })

  it('calls onSyncComplete when all finish', async () => {
    const onSyncComplete = vi.fn()
    let callCount = 0

    // First call: sync-all. Subsequent calls: sync-status for each group.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('sync-all')) {
        return new Response(JSON.stringify({ started: [1] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('sync-status')) {
        callCount++
        const status =
          callCount >= 1
            ? { status: 'done', progress: 10, total: 10 }
            : { status: 'syncing', progress: 5, total: 10 }
        return new Response(JSON.stringify(status), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useSyncStatus({ onSyncComplete }), {
      wrapper: createWrapper(),
    })

    act(() => result.current.handleSync([1]))

    await waitFor(() => expect(onSyncComplete).toHaveBeenCalled())
    await waitFor(() => expect(result.current.syncing).toBe(false))
  })

  it('exposes syncStatuses for active groups', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('sync-all')) {
        return new Response(JSON.stringify({ started: [5] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('sync-status')) {
        return new Response(
          JSON.stringify({ status: 'syncing', progress: 3, total: 10 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch

    const { result } = renderHook(
      () => useSyncStatus({ onSyncComplete: vi.fn() }),
      { wrapper: createWrapper() },
    )

    act(() => result.current.handleSync([5]))

    await waitFor(() => expect(result.current.syncStatuses[5]).toBeDefined())
    expect(result.current.syncStatuses[5].status).toBe('syncing')
  })
})
