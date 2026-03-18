import { renderHook, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'
import { createWrapper } from '#/test/wrapper'
import { useZipDownload } from '#/hooks/useZipDownload'

describe('useZipDownload', () => {
  it('starts with preparing=false', () => {
    const { result } = renderHook(() => useZipDownload(), {
      wrapper: createWrapper(),
    })
    expect(result.current.preparing).toBe(false)
    expect(result.current.zipStatus).toBeUndefined()
  })

  it('startDownload triggers prepare', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('prepare-zip')) {
        return new Response(JSON.stringify({ job_id: 'job-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('zip-status')) {
        return new Response(
          JSON.stringify({
            status: 'preparing',
            files_ready: 0,
            files_total: 3,
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useZipDownload(), {
      wrapper: createWrapper(),
    })

    act(() => result.current.startDownload([1, 2, 3]))

    await waitFor(() => expect(result.current.preparing).toBe(true))
  })

  it('triggers browser download on done', async () => {
    const onComplete = vi.fn()
    const clickSpy = vi.fn()

    // Mock document.createElement to capture anchor click
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a') {
        el.click = clickSpy
      }
      return el
    })

    let _callCount = 0
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('prepare-zip')) {
        return new Response(JSON.stringify({ job_id: 'job-456' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('zip-status')) {
        _callCount++
        return new Response(
          JSON.stringify({
            status: 'done',
            files_ready: 3,
            files_total: 3,
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useZipDownload({ onComplete }), {
      wrapper: createWrapper(),
    })

    act(() => result.current.startDownload([1, 2, 3]))

    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
    await waitFor(() => expect(result.current.preparing).toBe(false))
    expect(onComplete).toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('handles zip error', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url.includes('prepare-zip')) {
        return new Response(JSON.stringify({ job_id: 'job-err' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('zip-status')) {
        return new Response(
          JSON.stringify({
            status: 'error',
            files_ready: 0,
            files_total: 3,
            error: 'Disk full',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useZipDownload(), {
      wrapper: createWrapper(),
    })

    act(() => result.current.startDownload([1, 2, 3]))

    // Should reset preparing to false after error
    await waitFor(() => expect(result.current.preparing).toBe(false))
  })
})
