import { vi } from 'vitest'

/**
 * Mock globalThis.fetch so that URLs matching any key in `responses`
 * return the corresponding value as JSON.
 * Keys are matched as substrings of the request URL.
 */
export function mockFetch(responses: Record<string, unknown>) {
  const fn = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({ detail: 'Not found' }), {
      status: 404,
    })
  })

  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

/**
 * Mock a single URL to return an HTTP error.
 */
export function mockFetchError(_url: string, status: number, detail?: string) {
  const fn = vi.fn(async () => {
    return new Response(JSON.stringify({ detail: detail ?? 'Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

/**
 * Mock a single URL to return different responses on successive calls.
 */
export function mockFetchSequence(
  _url: string,
  responses: Array<{ status?: number; body: unknown }>,
) {
  let callIndex = 0

  const fn = vi.fn(async () => {
    const idx = Math.min(callIndex, responses.length - 1)
    callIndex++
    const res = responses[idx]
    return new Response(JSON.stringify(res.body), {
      status: res.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}
