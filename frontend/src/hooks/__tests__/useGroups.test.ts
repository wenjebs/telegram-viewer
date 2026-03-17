import { renderHook, waitFor, act } from '@testing-library/react'
import { createWrapper } from '#/test/wrapper'
import { mockFetch } from '#/test/fetch-mock'
import { makeGroup } from '#/test/fixtures'
import { useGroups } from '#/hooks/useGroups'

describe('useGroups', () => {
  it('fetches groups on mount', async () => {
    const groups = [makeGroup(), makeGroup()]
    mockFetch({
      '/api/groups': groups,
      '/api/groups/preview-counts': {},
    })

    const { result } = renderHook(
      () => useGroups(),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.groups.length).toBe(2))
  })

  it('returns loading state', () => {
    mockFetch({ '/api/groups': [] })
    const { result } = renderHook(
      () => useGroups(),
      { wrapper: createWrapper() },
    )
    // Initially loading is true
    expect(result.current.loading).toBe(true)
  })

  it('toggleActive calls API and updates cache', async () => {
    const g1 = makeGroup({ active: true })
    const g2 = makeGroup({ active: false })

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('/active')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/preview-counts')) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // Default: groups list
      return new Response(JSON.stringify([g1, g2]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const { result } = renderHook(
      () => useGroups(),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.groups.length).toBe(2))

    await act(async () => {
      await result.current.toggleActive(g1)
    })

    // The PATCH call should have been made
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/groups/${g1.id}/active`),
      expect.objectContaining({ method: 'PATCH' }),
    )

    // Verify the PATCH body contained the toggled active state
    const patchCall = (
      globalThis.fetch as ReturnType<typeof vi.fn>
    ).mock.calls.find((args: unknown[]) =>
      (args[0] as string).includes('/active'),
    )
    const body = JSON.parse(patchCall![1].body)
    expect(body.active).toBe(false)
  })

  it('activeGroupIds only includes active groups', async () => {
    const g1 = makeGroup({ active: true })
    const g2 = makeGroup({ active: false })
    const g3 = makeGroup({ active: true })
    mockFetch({
      '/api/groups': [g1, g2, g3],
      '/api/groups/preview-counts': {},
    })

    const { result } = renderHook(
      () => useGroups(),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.groups.length).toBe(3))
    expect(result.current.activeGroupIds).toEqual([g1.id, g3.id])
  })

  it('fetches previewCounts when active groups exist', async () => {
    const g1 = makeGroup({ active: true })
    const counts = { [g1.id]: { photos: 5, videos: 2, documents: 1, total: 8 } }
    const fetchFn = mockFetch({
      '/api/groups': [g1],
      '/api/groups/preview-counts': counts,
    })

    const { result } = renderHook(
      () => useGroups(),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.groups.length).toBe(1))
    await waitFor(() =>
      expect(fetchFn).toHaveBeenCalledWith(
        expect.stringContaining('/api/groups/preview-counts'),
        undefined,
      ),
    )
  })

  it('skips previewCounts with no active groups', async () => {
    const g1 = makeGroup({ active: false })
    const fetchFn = mockFetch({
      '/api/groups': [g1],
      '/api/groups/preview-counts': {},
    })

    const { result } = renderHook(
      () => useGroups(),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.groups.length).toBe(1))
    // preview-counts should not be fetched
    const previewCalls = fetchFn.mock.calls.filter((args) =>
      (args[0] as string).includes('preview-counts'),
    )
    expect(previewCalls.length).toBe(0)
  })
})
