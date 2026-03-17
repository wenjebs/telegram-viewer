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
  media_count: z.number().optional(),
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

export const Person = z.object({
  id: z.number(),
  name: z.string().nullable(),
  display_name: z.string(),
  representative_face_id: z.number().nullable(),
  face_count: z.number(),
  avatar_crop_path: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const FaceScanStatus = z.object({
  status: z.enum(['idle', 'scanning', 'clustering', 'done', 'error']),
  scanned: z.number(),
  total: z.number(),
  person_count: z.number(),
})

export const ZipJobResponse = z.object({ job_id: z.string() })
export const ZipStatusResponse = z.object({
  status: z.enum(['preparing', 'zipping', 'done', 'error']),
  files_ready: z.number(),
  files_total: z.number(),
  error: z.string().nullable(),
})

export const PreviewCountItem = z.object({
  photos: z.number(),
  videos: z.number(),
  documents: z.number(),
  total: z.number(),
})

export const PreviewCounts = z.record(z.string(), PreviewCountItem.nullable())

// --- Inferred types (exported for consumers) ---
export type AuthStatus = z.infer<typeof AuthStatus>
export type Group = z.infer<typeof Group>
export type MediaItem = z.infer<typeof MediaItem>
export type MediaPage = z.infer<typeof MediaPage>
export type SyncStatus = z.infer<typeof SyncStatus>
export type Person = z.infer<typeof Person>
export type FaceScanStatus = z.infer<typeof FaceScanStatus>
export type ZipJobResponse = z.infer<typeof ZipJobResponse>
export type ZipStatusResponse = z.infer<typeof ZipStatusResponse>
export type PreviewCountItem = z.infer<typeof PreviewCountItem>
export type PreviewCounts = z.infer<typeof PreviewCounts>
