export interface AuthStatus {
  authenticated: boolean
}

export interface Group {
  id: number
  name: string
  type: string
  unread_count: number
  active: boolean
  last_synced: string | null
}

export interface MediaItem {
  id: number
  message_id: number
  chat_id: number
  chat_name: string
  date: string
  media_type: 'photo' | 'video' | 'file'
  mime_type: string | null
  file_size: number | null
  width: number | null
  height: number | null
  duration: number | null
  caption: string | null
  thumbnail_path: string | null
}

export interface MediaPage {
  items: MediaItem[]
  next_cursor: number | null
}

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'done' | 'error'
  progress: number
  total: number
}
