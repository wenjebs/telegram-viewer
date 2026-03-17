import { describe, expect, it } from 'vitest'
import {
  makeFaceScanStatus,
  makeGroup,
  makeMediaItem,
  makeMediaPage,
  makePerson,
  makeSyncStatus,
} from './fixtures'
import { mockFetch, mockFetchError, mockFetchSequence } from './fetch-mock'
import { createWrapper } from './wrapper'

describe('test infrastructure smoke test', () => {
  it('fixture factories return valid shapes', () => {
    const item = makeMediaItem()
    expect(item.id).toBeTypeOf('number')
    expect(item.media_type).toBe('photo')

    const group = makeGroup({ name: 'Custom' })
    expect(group.name).toBe('Custom')

    const person = makePerson()
    expect(person.display_name).toContain('Person')

    const sync = makeSyncStatus({ status: 'syncing' })
    expect(sync.status).toBe('syncing')

    const scan = makeFaceScanStatus({ status: 'done', person_count: 5 })
    expect(scan.person_count).toBe(5)
  })

  it('makeMediaPage wraps items with cursor', () => {
    const items = [makeMediaItem(), makeMediaItem()]
    const page = makeMediaPage(items, 'abc123')
    expect(page.items).toHaveLength(2)
    expect(page.next_cursor).toBe('abc123')
  })

  it('mockFetch matches URL patterns', async () => {
    mockFetch({ '/groups': [makeGroup()] })
    const res = await fetch('/api/groups')
    const data = await res.json()
    expect(data).toHaveLength(1)
  })

  it('mockFetchError returns the given status', async () => {
    mockFetchError('/fail', 500, 'boom')
    const res = await fetch('/fail')
    expect(res.status).toBe(500)
  })

  it('mockFetchSequence returns successive responses', async () => {
    mockFetchSequence('/poll', [
      { body: { status: 'syncing' } },
      { body: { status: 'done' } },
    ])
    const r1 = await fetch('/poll')
    expect((await r1.json()).status).toBe('syncing')
    const r2 = await fetch('/poll')
    expect((await r2.json()).status).toBe('done')
  })

  it('createWrapper returns a component', () => {
    const Wrapper = createWrapper()
    expect(Wrapper).toBeTypeOf('function')
  })
})
