import { z, ZodError } from 'zod'
import {
  AuthStatus,
  ConflictsResponse,
  CountResponse,
  DeleteResponse,
  FaceScanStatus,
  IdsResponse,
  Group,
  ImportResult,
  MediaPage,
  Person,
  PreviewCounts,
  SuccessResponse,
  SyncStatus,
  ZipJobResponse,
  ZipStatusResponse,
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
      // eslint-disable-next-line no-console
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

export const unsyncGroup = (chatId: number) =>
  fetchJSON(`/groups/${chatId}/unsync`, SuccessResponse, {
    method: 'POST',
  })

export const clearAllMedia = () =>
  fetchJSON('/groups/media', SuccessResponse, {
    method: 'DELETE',
  })

export const getSyncStatus = (chatId: number) =>
  fetchJSON(`/groups/${chatId}/sync-status`, SyncStatus)

export const getPreviewCounts = () =>
  fetchJSON('/groups/preview-counts', PreviewCounts)

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
  faces?: string
  sort?: string
}) => {
  const sp = buildSearchParams({
    cursor: params.cursor,
    limit: params.limit,
    groups: params.groups,
    type: params.type,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    faces: params.faces,
    sort: params.sort,
  })
  return fetchJSON(`/media?${sp}`, MediaPage)
}

export const getThumbnailUrl = (mediaId: number, date?: string) =>
  `${BASE}/media/${mediaId}/thumbnail${date ? `?d=${date}` : ''}`

export const getDownloadUrl = (mediaId: number, date?: string) =>
  `${BASE}/media/${mediaId}/download${date ? `?d=${date}` : ''}`

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

export const unfavoriteMediaBatch = (mediaIds: number[]) =>
  fetchJSON('/media/unfavorite-batch', SuccessResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })

export const getHiddenMedia = (params: {
  cursor?: string
  limit?: number
  sort?: string
}) => {
  const sp = buildSearchParams({
    cursor: params.cursor,
    limit: params.limit,
    sort: params.sort,
  })
  return fetchJSON(`/media/hidden?${sp}`, MediaPage)
}

export const getHiddenCount = () =>
  fetchJSON('/media/hidden/count', CountResponse)

export const deleteMediaBatch = (mediaIds: number[]) =>
  fetchJSON('/media/delete-batch', DeleteResponse, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })

export const deleteAllHidden = () =>
  fetchJSON('/media/hidden', DeleteResponse, { method: 'DELETE' })

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
  sort?: string
}) => {
  const sp = buildSearchParams({
    cursor: params.cursor,
    limit: params.limit,
    sort: params.sort,
  })
  return fetchJSON(`/media/favorites?${sp}`, MediaPage)
}

export const getFavoritesCount = () =>
  fetchJSON('/media/favorites/count', CountResponse)

export const getMediaIds = (params: {
  groups?: number[]
  type?: string
  dateFrom?: string
  dateTo?: string
  faces?: string
  sort?: string
}) => {
  const sp = buildSearchParams({
    groups: params.groups,
    type: params.type,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    faces: params.faces,
    sort: params.sort,
  })
  const qs = sp.toString()
  return fetchJSON(`/media/ids${qs ? `?${qs}` : ''}`, IdsResponse)
}

export const getHiddenMediaIds = (sort?: string) => {
  const sp = buildSearchParams({ sort })
  return fetchJSON(`/media/hidden/ids?${sp}`, IdsResponse)
}

export const getFavoritesMediaIds = (sort?: string) => {
  const sp = buildSearchParams({ sort })
  return fetchJSON(`/media/favorites/ids?${sp}`, IdsResponse)
}

export const getPersonMediaIds = (params: {
  personId: number
  sort?: string
  faces?: string
}) => {
  const sp = buildSearchParams({ sort: params.sort, faces: params.faces })
  return fetchJSON(
    `/faces/persons/${params.personId}/media/ids?${sp}`,
    IdsResponse,
  )
}

export const getMediaCount = (params?: {
  groups?: number[]
  type?: string
  dateFrom?: string
  dateTo?: string
  faces?: string
}) => {
  if (!params) return fetchJSON('/media/count', CountResponse)
  const sp = buildSearchParams({
    groups: params.groups,
    type: params.type,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    faces: params.faces,
  })
  const qs = sp.toString()
  return fetchJSON(`/media/count${qs ? `?${qs}` : ''}`, CountResponse)
}

// Download (legacy sync endpoint kept for compatibility)
export async function downloadZip(mediaIds: number[]): Promise<Blob> {
  const resp = await fetch(`${BASE}/media/download-zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })
  await ensureOk(resp)
  return resp.blob()
}

// Async zip with progress
export const prepareZip = (mediaIds: number[]) =>
  fetchJSON('/media/prepare-zip', ZipJobResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })

export const getZipStatus = (jobId: string) =>
  fetchJSON(`/media/zip-status/${jobId}`, ZipStatusResponse)

export const getZipDownloadUrl = (jobId: string) =>
  `${BASE}/media/zip-download/${jobId}`

// Faces
export const getFaceScanStatus = () =>
  fetchJSON('/faces/scan-status', FaceScanStatus)

export const startFaceScan = (force = false) =>
  fetchJSON(
    `/faces/scan?force=${force}`,
    z.object({
      started: z.boolean(),
      status: z.string().optional(),
      scanned: z.number().optional(),
      total: z.number().optional(),
    }),
    { method: 'POST' },
  )

export const getPersons = () => fetchJSON('/faces/persons', z.array(Person))

export const getSimilarGroups = (threshold?: number) =>
  fetchJSON(
    `/faces/persons/similar-groups${threshold != null ? `?threshold=${threshold}` : ''}`,
    z.object({ groups: z.array(z.array(z.number())) }),
  )

export const getPersonMedia = (params: {
  personId: number
  cursor?: string
  limit?: number
  sort?: string
  faces?: string
}) => {
  const sp = buildSearchParams({
    cursor: params.cursor,
    limit: params.limit,
    sort: params.sort,
    faces: params.faces,
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

export const mergePersonsBatch = (keepId: number, mergeIds: number[]) =>
  fetchJSON('/faces/persons/merge-batch', SuccessResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keep_id: keepId, merge_ids: mergeIds }),
  })

export const removeFaceFromPerson = (personId: number, faceId: number) =>
  fetchJSON(`/faces/persons/${personId}/faces/${faceId}`, SuccessResponse, {
    method: 'DELETE',
  })

export const deletePerson = (personId: number) =>
  fetchJSON(`/faces/persons/${personId}`, SuccessResponse, {
    method: 'DELETE',
  })

export const getCrossPersonConflicts = (
  mediaIds: number[],
  excludePersonId: number,
) =>
  fetchJSON('/faces/persons/conflicts', ConflictsResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_ids: mediaIds,
      exclude_person_id: excludePersonId,
    }),
  })

export const getFaceCropUrl = (faceId: number, updatedAt?: string) =>
  `${BASE}/faces/${faceId}/crop${updatedAt ? `?v=${updatedAt}` : ''}`

// Settings
export async function exportSettings(): Promise<void> {
  const resp = await fetch(`${BASE}/settings/export`)
  await ensureOk(resp)
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download =
    resp.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ??
    'telegram-viewer-settings.json'
  a.click()
  URL.revokeObjectURL(url)
}

export async function importSettings(file: File): Promise<ImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  const resp = await fetch(`${BASE}/settings/import`, {
    method: 'POST',
    body: formData,
  })
  await ensureOk(resp)
  const data = await resp.json()
  return ImportResult.parse(data)
}
