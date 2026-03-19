import { z } from 'zod'

export const searchSchema = z.object({
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
  sort: z.enum(['asc', 'desc']).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  hiddenDialogs: z
    .union([z.literal('1'), z.literal('true'), z.literal(true)])
    .transform(() => true as const)
    .optional()
    .catch(undefined),
})

export type SearchParams = z.output<typeof searchSchema>
