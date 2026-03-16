import type { AuthStatus, Group, MediaPage, SyncStatus } from './types'

const BASE = '/api'

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, init)
  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`
    try {
      const body = await resp.json()
      if (body.detail) detail = body.detail
    } catch {}
    throw new Error(detail)
  }
  return resp.json()
}

// Auth
export const getAuthStatus = () => fetchJSON<AuthStatus>('/auth/status')

export const sendCode = (phone: string) =>
  fetchJSON<{ phone_code_hash: string }>('/auth/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })

export const verifyCode = (
  phone: string,
  code: string,
  phone_code_hash: string,
  password?: string,
) =>
  fetchJSON<{ success: boolean }>('/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, phone_code_hash, password }),
  })

export const logout = () =>
  fetchJSON<{ success: boolean }>('/auth/logout', { method: 'POST' })

// Groups
export const getGroups = () => fetchJSON<Group[]>('/groups')

export const toggleGroupActive = (
  chatId: number,
  active: boolean,
  chatName: string,
) =>
  fetchJSON<{ success: boolean }>(`/groups/${chatId}/active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active, chat_name: chatName }),
  })

export const startSyncAll = (chatIds: number[]) =>
  fetchJSON<{ started: number[] }>('/groups/sync-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_ids: chatIds }),
  })

export const clearGroupMedia = (chatId: number) =>
  fetchJSON<{ success: boolean }>(`/groups/${chatId}/media`, {
    method: 'DELETE',
  })

export const clearAllMedia = () =>
  fetchJSON<{ success: boolean }>('/groups/media', {
    method: 'DELETE',
  })

export const getSyncStatus = (chatId: number) =>
  fetchJSON<SyncStatus>(`/groups/${chatId}/sync-status`)

// Hidden dialogs
export const hideDialog = (chatId: number) =>
  fetchJSON<{ success: boolean }>(`/groups/${chatId}/hide`, { method: 'POST' })

export const unhideDialog = (chatId: number) =>
  fetchJSON<{ success: boolean }>(`/groups/${chatId}/unhide`, {
    method: 'POST',
  })

export const unhideDialogBatch = (dialogIds: number[]) =>
  fetchJSON<{ success: boolean }>('/groups/unhide-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dialog_ids: dialogIds }),
  })

export const getHiddenDialogs = () => fetchJSON<Group[]>('/groups/hidden')

export const getHiddenDialogCount = () =>
  fetchJSON<{ count: number }>('/groups/hidden/count')

// Media
export const getMedia = (params: {
  cursor?: number
  limit?: number
  groups?: number[]
  type?: string
  dateFrom?: string
  dateTo?: string
}) => {
  const searchParams = new URLSearchParams()
  if (params.cursor != null) searchParams.set('cursor', String(params.cursor))
  if (params.limit != null) searchParams.set('limit', String(params.limit))
  if (params.groups?.length) searchParams.set('groups', params.groups.join(','))
  if (params.type) searchParams.set('type', params.type)
  if (params.dateFrom) searchParams.set('date_from', params.dateFrom)
  if (params.dateTo) searchParams.set('date_to', params.dateTo)
  return fetchJSON<MediaPage>(`/media?${searchParams}`)
}

export const getThumbnailUrl = (mediaId: number) =>
  `${BASE}/media/${mediaId}/thumbnail`

export const getDownloadUrl = (mediaId: number) =>
  `${BASE}/media/${mediaId}/download`

// Hidden
export const hideMedia = (mediaId: number) =>
  fetchJSON<{ success: boolean }>(`/media/${mediaId}/hide`, {
    method: 'POST',
  })

export const unhideMedia = (mediaId: number) =>
  fetchJSON<{ success: boolean }>(`/media/${mediaId}/unhide`, {
    method: 'POST',
  })

export const unhideMediaBatch = (mediaIds: number[]) =>
  fetchJSON<{ success: boolean }>('/media/unhide-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })

export const getHiddenMedia = (params: { cursor?: number; limit?: number }) => {
  const searchParams = new URLSearchParams()
  if (params.cursor != null) searchParams.set('cursor', String(params.cursor))
  if (params.limit != null) searchParams.set('limit', String(params.limit))
  return fetchJSON<MediaPage>(`/media/hidden?${searchParams}`)
}

export const getHiddenCount = () =>
  fetchJSON<{ count: number }>('/media/hidden/count')

// Favorites
export const toggleFavorite = (mediaId: number) =>
  fetchJSON<{ success: boolean; favorited: boolean }>(
    `/media/${mediaId}/favorite`,
    { method: 'POST' },
  )

export const getFavoritesMedia = (params: {
  cursor?: number
  limit?: number
}) => {
  const searchParams = new URLSearchParams()
  if (params.cursor != null) searchParams.set('cursor', String(params.cursor))
  if (params.limit != null) searchParams.set('limit', String(params.limit))
  return fetchJSON<MediaPage>(`/media/favorites?${searchParams}`)
}

export const getFavoritesCount = () =>
  fetchJSON<{ count: number }>('/media/favorites/count')

// Download
export async function downloadZip(mediaIds: number[]): Promise<Blob> {
  const resp = await fetch(`${BASE}/media/download-zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })
  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`
    try {
      const body = await resp.json()
      if (body.detail) detail = body.detail
    } catch {}
    throw new Error(detail)
  }
  return resp.blob()
}
