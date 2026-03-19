import { vi } from 'vitest'
import { mockFetch, mockFetchError } from '#/test/fetch-mock'
import {
  makeMediaItem,
  makeMediaPage,
  makeFaceScanStatus,
  makeSyncStatus,
} from '#/test/fixtures'
import {
  clearGroupMedia,
  deletePersonsBatch,
  downloadZip,
  getAuthStatus,
  getDownloadUrl,
  getFaceCropUrl,
  getFaceScanStatus,
  getMedia,
  getPersons,
  getPersonMedia,
  getSimilarGroups,
  getSyncStatus,
  getThumbnailUrl,
  startFaceScan,
  startSyncAll,
  toggleGroupActive,
  verifyCode,
} from '#/api/client'

// ── ensureOk (internal, tested via exported functions) ──

describe('ensureOk', () => {
  it('does not throw for 200 response', async () => {
    mockFetch({ '/auth/status': { authenticated: true } })
    await expect(getAuthStatus()).resolves.toBeTruthy()
  })

  it('throws with status text for non-ok response', async () => {
    mockFetchError('/auth/status', 500)
    await expect(getAuthStatus()).rejects.toThrow()
  })

  it('uses detail from JSON body when present', async () => {
    mockFetchError('/auth/status', 400, 'bad phone number')
    await expect(getAuthStatus()).rejects.toThrow('bad phone number')
  })

  it('handles non-JSON error body gracefully', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      })
    }) as unknown as typeof fetch
    await expect(getAuthStatus()).rejects.toThrow('500 Internal Server Error')
  })
})

// ── fetchJSON (internal, tested via exported functions) ──

describe('fetchJSON', () => {
  it('fetches from /api prefix', async () => {
    const fn = mockFetch({ '/api/auth/status': { authenticated: true } })
    await getAuthStatus()
    expect(fn).toHaveBeenCalledTimes(1)
    const url = fn.mock.calls[0][0] as string
    expect(url).toBe('/api/auth/status')
  })

  it('parses response with Zod schema', async () => {
    mockFetch({ '/auth/status': { authenticated: false } })
    const result = await getAuthStatus()
    expect(result).toEqual({ authenticated: false })
  })

  it('throws on Zod validation failure', async () => {
    mockFetch({ '/auth/status': { authenticated: 'not-a-boolean' } })
    await expect(getAuthStatus()).rejects.toThrow(
      'Unexpected API response from /auth/status',
    )
  })

  it('passes RequestInit through', async () => {
    const fn = mockFetch({ '/auth/verify': { success: true } })
    await verifyCode('123', '456', 'hash123')
    const init = fn.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })
})

// ── buildSearchParams (internal, tested via getMedia) ──

describe('buildSearchParams', () => {
  it('omits null/undefined values', async () => {
    const fn = mockFetch({
      '/media': { items: [], next_cursor: null },
    })
    await getMedia({})
    const url = fn.mock.calls[0][0] as string
    // Should have no query params besides the empty searchparams
    expect(url).toBe('/api/media?')
  })

  it('joins arrays with commas', async () => {
    const fn = mockFetch({
      '/media': { items: [], next_cursor: null },
    })
    await getMedia({ groups: [1, 2, 3] })
    const url = fn.mock.calls[0][0] as string
    expect(url).toContain('groups=1%2C2%2C3')
  })

  it('skips empty arrays', async () => {
    const fn = mockFetch({
      '/media': { items: [], next_cursor: null },
    })
    await getMedia({ groups: [] })
    const url = fn.mock.calls[0][0] as string
    expect(url).not.toContain('groups')
  })

  it('converts numbers to strings', async () => {
    const fn = mockFetch({
      '/media': { items: [], next_cursor: null },
    })
    await getMedia({ limit: 20 })
    const url = fn.mock.calls[0][0] as string
    expect(url).toContain('limit=20')
  })
})

// ── GET simple ──

describe('getAuthStatus', () => {
  it('returns parsed auth status', async () => {
    mockFetch({ '/auth/status': { authenticated: true } })
    const result = await getAuthStatus()
    expect(result).toEqual({ authenticated: true })
  })
})

// ── GET with params ──

describe('getMedia', () => {
  it('builds complex query string with all filter params', async () => {
    const fn = mockFetch({
      '/media': { items: [], next_cursor: null },
    })
    await getMedia({
      cursor: 'abc',
      limit: 50,
      groups: [10, 20],
      type: 'photo',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      faces: '1,2',
    })
    const url = fn.mock.calls[0][0] as string
    expect(url).toContain('cursor=abc')
    expect(url).toContain('limit=50')
    expect(url).toContain('groups=10%2C20')
    expect(url).toContain('type=photo')
    expect(url).toContain('date_from=2026-01-01')
    expect(url).toContain('date_to=2026-12-31')
    expect(url).toContain('faces=1%2C2')
  })

  it('returns parsed MediaPage', async () => {
    const page = makeMediaPage([makeMediaItem()], 'next')
    mockFetch({ '/media': page })
    const result = await getMedia({})
    expect(result.items).toHaveLength(1)
    expect(result.next_cursor).toBe('next')
  })
})

// ── POST with body ──

describe('verifyCode', () => {
  it('sends all fields in body', async () => {
    const fn = mockFetch({ '/auth/verify': { success: true } })
    await verifyCode('555', '1234', 'hash', 'pw')
    const body = JSON.parse(fn.mock.calls[0][1]!.body as string)
    expect(body).toEqual({
      phone: '555',
      code: '1234',
      phone_code_hash: 'hash',
      password: 'pw',
    })
  })

  it('sends without optional password', async () => {
    const fn = mockFetch({ '/auth/verify': { success: true } })
    await verifyCode('555', '1234', 'hash')
    const body = JSON.parse(fn.mock.calls[0][1]!.body as string)
    expect(body.password).toBeUndefined()
  })
})

describe('startSyncAll', () => {
  it('sends array body', async () => {
    const fn = mockFetch({ '/groups/sync-all': { started: [1, 2] } })
    await startSyncAll([1, 2])
    const body = JSON.parse(fn.mock.calls[0][1]!.body as string)
    expect(body).toEqual({ chat_ids: [1, 2] })
  })

  it('uses POST method', async () => {
    const fn = mockFetch({ '/groups/sync-all': { started: [] } })
    await startSyncAll([])
    expect(fn.mock.calls[0][1]!.method).toBe('POST')
  })
})

// ── PATCH ──

describe('toggleGroupActive', () => {
  it('sends correct body shape', async () => {
    const fn = mockFetch({ '/groups/42/active': { success: true } })
    await toggleGroupActive(42, true, 'My Chat')
    const body = JSON.parse(fn.mock.calls[0][1]!.body as string)
    expect(body).toEqual({ active: true, chat_name: 'My Chat' })
  })

  it('uses PATCH method', async () => {
    const fn = mockFetch({ '/groups/42/active': { success: true } })
    await toggleGroupActive(42, false, 'Chat')
    expect(fn.mock.calls[0][1]!.method).toBe('PATCH')
  })
})

// ── DELETE ──

describe('clearGroupMedia', () => {
  it('URL includes chatId', async () => {
    const fn = mockFetch({ '/groups/99/media': { success: true } })
    await clearGroupMedia(99)
    const url = fn.mock.calls[0][0] as string
    expect(url).toBe('/api/groups/99/media')
  })

  it('uses DELETE method', async () => {
    const fn = mockFetch({ '/groups/99/media': { success: true } })
    await clearGroupMedia(99)
    expect(fn.mock.calls[0][1]!.method).toBe('DELETE')
  })
})

describe('deletePersonsBatch', () => {
  it('deletePersonsBatch sends DELETE with person_ids', async () => {
    const fn = mockFetch({ '/faces/persons/delete-batch': { deleted: 2 } })
    const result = await deletePersonsBatch([1, 2])
    expect(result).toEqual({ deleted: 2 })
    expect(fn).toHaveBeenCalledWith(
      '/api/faces/persons/delete-batch',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ person_ids: [1, 2] }),
      }),
    )
  })
})

// ── URL builders ──

describe('getThumbnailUrl', () => {
  it('returns URL without cache param when no date', () => {
    expect(getThumbnailUrl(5)).toBe('/api/media/5/thumbnail')
  })

  it('appends date as cache-busting param', () => {
    expect(getThumbnailUrl(5, '2026-01-01')).toBe(
      '/api/media/5/thumbnail?d=2026-01-01',
    )
  })
})

describe('getDownloadUrl', () => {
  it('returns URL without cache param when no date', () => {
    expect(getDownloadUrl(7)).toBe('/api/media/7/download')
  })

  it('appends date as cache-busting param', () => {
    expect(getDownloadUrl(7, '2026-03-01')).toBe(
      '/api/media/7/download?d=2026-03-01',
    )
  })
})

describe('getFaceCropUrl', () => {
  it('returns URL without version param', () => {
    expect(getFaceCropUrl(10)).toBe('/api/faces/10/crop')
  })

  it('appends updatedAt as cache-busting param', () => {
    expect(getFaceCropUrl(10, '2026-02-15T00:00:00Z')).toBe(
      '/api/faces/10/crop?v=2026-02-15T00:00:00Z',
    )
  })
})

// ── Non-trivial param handling ──

describe('startFaceScan', () => {
  it('passes force=false by default', async () => {
    const fn = mockFetch({
      '/faces/scan': { started: true },
    })
    await startFaceScan()
    const url = fn.mock.calls[0][0] as string
    expect(url).toContain('force=false')
  })

  it('passes force=true when specified', async () => {
    const fn = mockFetch({
      '/faces/scan': { started: true },
    })
    await startFaceScan(true)
    const url = fn.mock.calls[0][0] as string
    expect(url).toContain('force=true')
  })
})

describe('getSimilarGroups', () => {
  it('omits threshold when not provided', async () => {
    const fn = mockFetch({
      '/faces/persons/similar-groups': { groups: [] },
    })
    await getSimilarGroups()
    const url = fn.mock.calls[0][0] as string
    expect(url).toBe('/api/faces/persons/similar-groups')
  })

  it('includes threshold when provided', async () => {
    const fn = mockFetch({
      '/faces/persons/similar-groups': { groups: [[1, 2]] },
    })
    await getSimilarGroups(0.7)
    const url = fn.mock.calls[0][0] as string
    expect(url).toContain('threshold=0.7')
  })
})

describe('getPersonMedia', () => {
  it('includes faces param in URL', async () => {
    const fn = mockFetch({
      '/faces/persons/1/media': { items: [], next_cursor: null },
    })
    await getPersonMedia({ personId: 1, faces: 'solo' })
    const url = fn.mock.calls[0][0] as string
    expect(url).toContain('faces=solo')
  })
})

describe('downloadZip', () => {
  it('returns a Blob, not JSON', async () => {
    const blobContent = new Uint8Array([80, 75, 3, 4])
    globalThis.fetch = vi.fn(async () => {
      return new Response(blobContent, {
        status: 200,
        headers: { 'Content-Type': 'application/zip' },
      })
    }) as unknown as typeof fetch

    const result = await downloadZip([1, 2])
    expect(result.size).toBeGreaterThan(0)
    expect(typeof result.arrayBuffer).toBe('function')
  })

  it('sends media_ids in POST body', async () => {
    const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(new Uint8Array([0]), {
        status: 200,
      })
    })
    globalThis.fetch = fn as unknown as typeof fetch

    await downloadZip([10, 20])
    const body = JSON.parse(fn.mock.calls[0][1]!.body as string)
    expect(body).toEqual({ media_ids: [10, 20] })
  })

  it('throws on error response', async () => {
    mockFetchError('/media/download-zip', 500, 'zip failed')
    await expect(downloadZip([1])).rejects.toThrow('zip failed')
  })
})

// ── Additional representative tests ──

describe('getSyncStatus', () => {
  it('includes chatId in URL', async () => {
    const fn = mockFetch({
      '/groups/55/sync-status': makeSyncStatus(),
    })
    await getSyncStatus(55)
    const url = fn.mock.calls[0][0] as string
    expect(url).toBe('/api/groups/55/sync-status')
  })
})

describe('getPersons', () => {
  it('returns parsed array of persons', async () => {
    mockFetch({ '/faces/persons': [] })
    const result = await getPersons()
    expect(result).toEqual([])
  })
})

describe('getFaceScanStatus', () => {
  it('returns parsed face scan status', async () => {
    const status = makeFaceScanStatus({
      status: 'scanning',
      scanned: 5,
      total: 20,
    })
    mockFetch({ '/faces/scan-status': status })
    const result = await getFaceScanStatus()
    expect(result).toEqual(status)
  })
})
