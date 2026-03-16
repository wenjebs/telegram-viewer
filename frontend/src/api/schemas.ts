import { z } from 'zod'

// --- Reusable response schemas ---
export const SuccessResponse = z.object({ success: z.boolean() })
export const CountResponse = z.object({ count: z.number() })

// --- Domain schemas ---
export const AuthStatus = z.object({ authenticated: z.boolean() })

export const Group = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  unread_count: z.number(),
  active: z.boolean(),
  last_synced: z.string().nullable(),
  hidden_at: z.string().nullable(),
})

export const MediaItem = z.object({
  id: z.number(),
  message_id: z.number(),
  chat_id: z.number(),
  chat_name: z.string(),
  date: z.string(),
  media_type: z.enum(['photo', 'video', 'file']),
  mime_type: z.string().nullable(),
  file_size: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  duration: z.number().nullable(),
  caption: z.string().nullable(),
  thumbnail_path: z.string().nullable(),
  sender_name: z.string().nullable(),
  hidden_at: z.string().nullable(),
  favorited_at: z.string().nullable(),
})

export const MediaPage = z.object({
  items: z.array(MediaItem),
  next_cursor: z.string().nullable(),
})

export const SyncStatus = z.object({
  status: z.enum(['idle', 'syncing', 'done', 'error']),
  progress: z.number(),
  total: z.number(),
})

// --- Inferred types (exported for consumers) ---
export type AuthStatus = z.infer<typeof AuthStatus>
export type Group = z.infer<typeof Group>
export type MediaItem = z.infer<typeof MediaItem>
export type MediaPage = z.infer<typeof MediaPage>
export type SyncStatus = z.infer<typeof SyncStatus>
