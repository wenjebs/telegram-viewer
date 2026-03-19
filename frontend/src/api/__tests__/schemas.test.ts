import {
  AuthStatus,
  CacheJobStatus,
  CountResponse,
  FaceScanStatus,
  Group,
  MediaItem,
  MediaPage,
  Person,
  PreviewCounts,
  SuccessResponse,
  SyncStatus,
  ZipJobResponse,
  ZipStatusResponse,
} from '#/api/schemas'
import {
  makeFaceScanStatus,
  makeGroup,
  makeMediaItem,
  makeMediaPage,
  makePerson,
  makeSyncStatus,
} from '#/test/fixtures'

describe('SuccessResponse', () => {
  it('parses valid data', () => {
    expect(SuccessResponse.parse({ success: true })).toEqual({
      success: true,
    })
  })

  it('rejects missing field', () => {
    expect(() => SuccessResponse.parse({})).toThrow()
  })

  it('rejects wrong type', () => {
    expect(() => SuccessResponse.parse({ success: 'yes' })).toThrow()
  })
})

describe('CountResponse', () => {
  it('parses valid data', () => {
    expect(CountResponse.parse({ count: 42 })).toEqual({ count: 42 })
  })

  it('rejects wrong type', () => {
    expect(() => CountResponse.parse({ count: 'many' })).toThrow()
  })
})

describe('AuthStatus', () => {
  it('parses valid data', () => {
    expect(AuthStatus.parse({ authenticated: false })).toEqual({
      authenticated: false,
    })
  })

  it('rejects missing field', () => {
    expect(() => AuthStatus.parse({})).toThrow()
  })
})

describe('Group', () => {
  it('parses valid group from fixture', () => {
    const g = makeGroup()
    expect(Group.parse(g)).toEqual(g)
  })

  it('accepts nullable fields as null', () => {
    const g = makeGroup({ last_synced: null, hidden_at: null })
    expect(Group.parse(g)).toEqual(g)
  })

  it('accepts nullable fields with values', () => {
    const g = makeGroup({
      last_synced: '2026-01-01T00:00:00Z',
      hidden_at: '2026-01-02T00:00:00Z',
    })
    expect(Group.parse(g)).toEqual(g)
  })

  it('rejects missing required fields', () => {
    expect(() => Group.parse({ id: 1 })).toThrow()
  })

  it('rejects wrong type for id', () => {
    const g = makeGroup()
    expect(() => Group.parse({ ...g, id: 'abc' })).toThrow()
  })
})

describe('MediaItem', () => {
  it('parses valid item from fixture', () => {
    const m = makeMediaItem()
    expect(MediaItem.parse(m)).toEqual(m)
  })

  it('validates media_type enum - photo', () => {
    expect(MediaItem.parse(makeMediaItem({ media_type: 'photo' }))).toBeTruthy()
  })

  it('validates media_type enum - video', () => {
    expect(MediaItem.parse(makeMediaItem({ media_type: 'video' }))).toBeTruthy()
  })

  it('validates media_type enum - file', () => {
    expect(MediaItem.parse(makeMediaItem({ media_type: 'file' }))).toBeTruthy()
  })

  it('rejects invalid media_type', () => {
    expect(() =>
      MediaItem.parse(makeMediaItem({ media_type: 'audio' as never })),
    ).toThrow()
  })

  it('accepts all nullable fields as null', () => {
    const m = makeMediaItem({
      mime_type: null,
      file_size: null,
      width: null,
      height: null,
      duration: null,
      caption: null,
      thumbnail_path: null,
      sender_name: null,
      hidden_at: null,
      favorited_at: null,
    })
    expect(MediaItem.parse(m)).toEqual(m)
  })

  it('rejects missing required fields', () => {
    expect(() => MediaItem.parse({ id: 1 })).toThrow()
  })
})

describe('MediaPage', () => {
  it('parses valid page from fixture', () => {
    const page = makeMediaPage([makeMediaItem()], 'cursor_abc')
    expect(MediaPage.parse(page)).toEqual(page)
  })

  it('accepts null next_cursor', () => {
    const page = makeMediaPage([makeMediaItem()], null)
    expect(MediaPage.parse(page).next_cursor).toBeNull()
  })

  it('rejects missing items', () => {
    expect(() => MediaPage.parse({ next_cursor: null })).toThrow()
  })
})

describe('SyncStatus', () => {
  it('parses valid data from fixture', () => {
    const s = makeSyncStatus()
    expect(SyncStatus.parse(s)).toEqual(s)
  })

  it.each(['idle', 'syncing', 'done', 'error'] as const)(
    'accepts status "%s"',
    (status) => {
      expect(SyncStatus.parse(makeSyncStatus({ status }))).toBeTruthy()
    },
  )

  it('rejects invalid status', () => {
    expect(() =>
      SyncStatus.parse(makeSyncStatus({ status: 'paused' as never })),
    ).toThrow()
  })
})

describe('Person', () => {
  it('parses valid data from fixture', () => {
    const p = makePerson()
    expect(Person.parse(p)).toEqual(p)
  })

  it('accepts nullable fields as null', () => {
    const p = makePerson({
      name: null,
      representative_face_id: null,
      avatar_crop_path: null,
    })
    expect(Person.parse(p)).toEqual(p)
  })

  it('rejects missing required fields', () => {
    expect(() => Person.parse({ id: 1 })).toThrow()
  })
})

describe('FaceScanStatus', () => {
  it('parses valid data from fixture', () => {
    const s = makeFaceScanStatus()
    expect(FaceScanStatus.parse(s)).toEqual(s)
  })

  it.each(['idle', 'scanning', 'clustering', 'done', 'error'] as const)(
    'accepts status "%s"',
    (status) => {
      expect(FaceScanStatus.parse(makeFaceScanStatus({ status }))).toBeTruthy()
    },
  )

  it('rejects invalid status', () => {
    expect(() =>
      FaceScanStatus.parse(makeFaceScanStatus({ status: 'running' as never })),
    ).toThrow()
  })
})

describe('ZipJobResponse', () => {
  it('parses valid data', () => {
    expect(ZipJobResponse.parse({ job_id: 'abc-123' })).toEqual({
      job_id: 'abc-123',
    })
  })

  it('rejects missing job_id', () => {
    expect(() => ZipJobResponse.parse({})).toThrow()
  })
})

describe('ZipStatusResponse', () => {
  it('parses valid data', () => {
    const data = {
      status: 'preparing',
      files_ready: 0,
      files_total: 10,
      error: null,
    }
    expect(ZipStatusResponse.parse(data)).toEqual(data)
  })

  it.each(['preparing', 'zipping', 'done', 'error'] as const)(
    'accepts status "%s"',
    (status) => {
      expect(
        ZipStatusResponse.parse({
          status,
          files_ready: 0,
          files_total: 5,
          error: null,
        }),
      ).toBeTruthy()
    },
  )

  it('rejects invalid status', () => {
    expect(() =>
      ZipStatusResponse.parse({
        status: 'canceled',
        files_ready: 0,
        files_total: 0,
        error: null,
      }),
    ).toThrow()
  })

  it('accepts error as string', () => {
    const data = {
      status: 'error',
      files_ready: 0,
      files_total: 10,
      error: 'something went wrong',
    }
    expect(ZipStatusResponse.parse(data).error).toBe('something went wrong')
  })
})

describe('CacheJobStatus', () => {
  it('parses a valid running status', () => {
    const data = {
      status: 'running',
      total_items: 100,
      cached_items: 42,
      skipped_items: 10,
      failed_items: 2,
      bytes_cached: 5000000,
      flood_wait_until: null,
      error: null,
    }
    expect(CacheJobStatus.parse(data)).toEqual(data)
  })

  it('rejects invalid status', () => {
    expect(() =>
      CacheJobStatus.parse({ status: 'bogus', total_items: 0 }),
    ).toThrow()
  })
})

describe('PreviewCounts', () => {
  it('parses valid record', () => {
    const data = {
      '123': { photos: 5, videos: 2, documents: 1, total: 8 },
    }
    expect(PreviewCounts.parse(data)).toEqual(data)
  })

  it('accepts null values', () => {
    const data = { '123': null }
    expect(PreviewCounts.parse(data)).toEqual(data)
  })

  it('accepts empty record', () => {
    expect(PreviewCounts.parse({})).toEqual({})
  })

  it('rejects invalid nested shape', () => {
    expect(() => PreviewCounts.parse({ '123': { photos: 'many' } })).toThrow()
  })
})
