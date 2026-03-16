import type { AuthStatus, Group, MediaPage, SyncStatus } from './types'

const BASE = '/api'

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, init)
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`)
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

export const syncGroup = async (
  chatId: number,
  onProgress?: (progress: number, total: number) => void,
) => {
  const resp = await fetch(`${BASE}/groups/${chatId}/sync`, { method: 'POST' })
  const reader = resp.body?.getReader()
  const decoder = new TextDecoder()
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      const match = text.match(/"progress":\s*(\d+),\s*"total":\s*(\d+)/)
      if (match && onProgress) onProgress(Number(match[1]), Number(match[2]))
    }
  }
}

export const getSyncStatus = (chatId: number) =>
  fetchJSON<SyncStatus>(`/groups/${chatId}/sync-status`)

// Media
export const getMedia = (params: {
  cursor?: number
  limit?: number
  groups?: number[]
  type?: string
}) => {
  const searchParams = new URLSearchParams()
  if (params.cursor) searchParams.set('cursor', String(params.cursor))
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.groups?.length) searchParams.set('groups', params.groups.join(','))
  if (params.type) searchParams.set('type', params.type)
  return fetchJSON<MediaPage>(`/media?${searchParams}`)
}

export const getThumbnailUrl = (mediaId: number) =>
  `${BASE}/media/${mediaId}/thumbnail`

export const getDownloadUrl = (mediaId: number) =>
  `${BASE}/media/${mediaId}/download`
