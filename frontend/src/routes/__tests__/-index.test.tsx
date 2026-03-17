import { z } from 'zod'

// Test the search schema directly without needing router
const searchSchema = z.object({
  mode: z
    .enum(['normal', 'hidden', 'favorites', 'people'])
    .optional()
    .catch(undefined),
  person: z.coerce.number().optional().catch(undefined),
  item: z.coerce.number().optional().catch(undefined),
  media: z.enum(['photo', 'video']).optional().catch(undefined),
  chat: z.enum(['dm', 'group', 'channel']).optional().catch(undefined),
  faces: z.enum(['none', 'solo', 'group']).optional().catch(undefined),
  sync: z.enum(['synced', 'unsynced']).optional().catch(undefined),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  groups: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  hiddenDialogs: z
    .union([z.literal('1'), z.literal('true'), z.literal(true)])
    .transform(() => true as const)
    .optional()
    .catch(undefined),
})

describe('searchSchema', () => {
  it('parses valid mode param', () => {
    const result = searchSchema.parse({ mode: 'hidden' })
    expect(result.mode).toBe('hidden')
  })

  it('catches invalid mode gracefully', () => {
    const result = searchSchema.parse({ mode: 'invalid_mode' })
    expect(result.mode).toBeUndefined()
  })

  it('parses date range params', () => {
    const result = searchSchema.parse({
      from: '2026-01-01',
      to: '2026-12-31',
    })
    expect(result.from).toBe('2026-01-01')
    expect(result.to).toBe('2026-12-31')
  })

  it('catches invalid date format', () => {
    const result = searchSchema.parse({ from: 'not-a-date' })
    expect(result.from).toBeUndefined()
  })

  it('parses all valid params together', () => {
    const result = searchSchema.parse({
      mode: 'people',
      person: '42',
      media: 'video',
      chat: 'dm',
      from: '2026-01-01',
      to: '2026-06-30',
      groups: '1,2,3',
      q: 'search term',
      hiddenDialogs: '1',
    })
    expect(result.mode).toBe('people')
    expect(result.person).toBe(42)
    expect(result.media).toBe('video')
    expect(result.chat).toBe('dm')
    expect(result.from).toBe('2026-01-01')
    expect(result.to).toBe('2026-06-30')
    expect(result.groups).toBe('1,2,3')
    expect(result.q).toBe('search term')
    expect(result.hiddenDialogs).toBe(true)
  })
})
