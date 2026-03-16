import { z, ZodError } from 'zod'
import {
  AuthStatus,
  CountResponse,
  FaceScanStatus,
  Group,
  MediaPage,
  Person,
  SuccessResponse,
  SyncStatus,
} from './schemas'

const BASE = '/api'

async function ensureOk(resp: Response): Promise<void> {
  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`
    try {
      const body = await resp.json()
      if (body.detail) detail = body.detail
    } catch {}
    throw new Error(detail)
  }
}

async function fetchJSON<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, init)
  await ensureOk(resp)
  const data = await resp.json()
  try {
    return schema.parse(data)
  } catch (e) {
    if (e instanceof ZodError) {
      console.error('API validation failed:', path, e.issues)
      throw new Error(`Unexpected API response from ${path}`, { cause: e })
    }
    throw e
  }
}

// Auth
export const getAuthStatus = () => fetchJSON('/auth/status', AuthStatus)

export const sendCode = (phone: string) =>
  fetchJSON('/auth/send-code', z.object({ phone_code_hash: z.string() }), {
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
  fetchJSON('/auth/verify', SuccessResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, phone_code_hash, password }),
  })

export const logout = () =>
  fetchJSON('/auth/logout', SuccessResponse, { method: 'POST' })

// Groups
export const getGroups = () => fetchJSON('/groups', z.array(Group))

export const toggleGroupActive = (
  chatId: number,
  active: boolean,
  chatName: string,
) =>
  fetchJSON(`/groups/${chatId}/active`, SuccessResponse, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active, chat_name: chatName }),
  })

export const startSyncAll = (chatIds: number[]) =>
  fetchJSON('/groups/sync-all', z.object({ started: z.array(z.number()) }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_ids: chatIds }),
  })

export const clearGroupMedia = (chatId: number) =>
  fetchJSON(`/groups/${chatId}/media`, SuccessResponse, {
    method: 'DELETE',
  })

export const clearAllMedia = () =>
  fetchJSON('/groups/media', SuccessResponse, {
    method: 'DELETE',
  })

export const getSyncStatus = (chatId: number) =>
  fetchJSON(`/groups/${chatId}/sync-status`, SyncStatus)

// Hidden dialogs
export const hideDialog = (chatId: number) =>
  fetchJSON(`/groups/${chatId}/hide`, SuccessResponse, {
    method: 'POST',
  })

export const unhideDialog = (chatId: number) =>
  fetchJSON(`/groups/${chatId}/unhide`, SuccessResponse, {
    method: 'POST',
  })

export const unhideDialogBatch = (dialogIds: number[]) =>
  fetchJSON('/groups/unhide-batch', SuccessResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dialog_ids: dialogIds }),
  })

export const getHiddenDialogs = () =>
  fetchJSON('/groups/hidden', z.array(Group))

export const getHiddenDialogCount = () =>
  fetchJSON('/groups/hidden/count', CountResponse)

// Helpers
function buildSearchParams(
  params: Record<string, string | number | number[] | undefined | null>,
): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(','))
    } else {
      sp.set(k, String(v))
    }
  }
  return sp
}

// Media
export const getMedia = (params: {
  cursor?: string
  limit?: number
  groups?: number[]
  type?: string
  dateFrom?: string
  dateTo?: string
}) => {
  const sp = buildSearchParams({
    cursor: params.cursor,
    limit: params.limit,
    groups: params.groups,
    type: params.type,
    date_from: params.dateFrom,
    date_to: params.dateTo,
  })
  return fetchJSON(`/media?${sp}`, MediaPage)
}

export const getThumbnailUrl = (mediaId: number) =>
  `${BASE}/media/${mediaId}/thumbnail`

export const getDownloadUrl = (mediaId: number) =>
  `${BASE}/media/${mediaId}/download`

// Hidden
export const hideMedia = (mediaId: number) =>
  fetchJSON(`/media/${mediaId}/hide`, SuccessResponse, {
    method: 'POST',
  })

export const unhideMedia = (mediaId: number) =>
  fetchJSON(`/media/${mediaId}/unhide`, SuccessResponse, {
    method: 'POST',
  })

export const unhideMediaBatch = (mediaIds: number[]) =>
  fetchJSON('/media/unhide-batch', SuccessResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })

export const hideMediaBatch = (mediaIds: number[]) =>
  fetchJSON('/media/hide-batch', SuccessResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })

export const favoriteMediaBatch = (mediaIds: number[]) =>
  fetchJSON('/media/favorite-batch', SuccessResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })

export const getHiddenMedia = (params: { cursor?: string; limit?: number }) => {
  const sp = buildSearchParams({
    cursor: params.cursor,
    limit: params.limit,
  })
  return fetchJSON(`/media/hidden?${sp}`, MediaPage)
}

export const getHiddenCount = () =>
  fetchJSON('/media/hidden/count', CountResponse)

// Favorites
export const toggleFavorite = (mediaId: number) =>
  fetchJSON(
    `/media/${mediaId}/favorite`,
    z.object({ success: z.boolean(), favorited: z.boolean() }),
    { method: 'POST' },
  )

export const getFavoritesMedia = (params: {
  cursor?: string
  limit?: number
}) => {
  const sp = buildSearchParams({
    cursor: params.cursor,
    limit: params.limit,
  })
  return fetchJSON(`/media/favorites?${sp}`, MediaPage)
}

export const getFavoritesCount = () =>
  fetchJSON('/media/favorites/count', CountResponse)

// Download
export async function downloadZip(mediaIds: number[]): Promise<Blob> {
  const resp = await fetch(`${BASE}/media/download-zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })
  await ensureOk(resp)
  return resp.blob()
}

// Faces
export const getFaceScanStatus = () =>
  fetchJSON('/faces/scan-status', FaceScanStatus)

export const startFaceScan = (force = false) =>
  fetchJSON(`/faces/scan?force=${force}`, z.object({ started: z.boolean() }), {
    method: 'POST',
  })

export const getPersons = () => fetchJSON('/faces/persons', z.array(Person))

export const getPersonMedia = (params: {
  personId: number
  cursor?: string
  limit?: number
}) => {
  const sp = buildSearchParams({
    cursor: params.cursor,
    limit: params.limit,
  })
  return fetchJSON(`/faces/persons/${params.personId}/media?${sp}`, MediaPage)
}

export const renamePerson = (id: number, name: string) =>
  fetchJSON(`/faces/persons/${id}`, SuccessResponse, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const mergePersons = (keepId: number, mergeId: number) =>
  fetchJSON('/faces/persons/merge', SuccessResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keep_id: keepId, merge_id: mergeId }),
  })

export const removeFaceFromPerson = (personId: number, faceId: number) =>
  fetchJSON(`/faces/persons/${personId}/faces/${faceId}`, SuccessResponse, {
    method: 'DELETE',
  })

export const getFaceCropUrl = (faceId: number) => `${BASE}/faces/${faceId}/crop`
