import { useCallback } from 'react'
import { getMedia } from '#/api/client'
import { usePaginatedMedia } from './usePaginatedMedia'

interface MediaFilters {
  groups?: number[]
  type?: string
  dateFrom?: string
  dateTo?: string
}

export function useMedia() {
  const fetchFn = useCallback(
    (params: MediaFilters & { cursor?: number; limit?: number }) =>
      getMedia(params),
    [],
  )

  const { fetchPage, ...rest } = usePaginatedMedia<MediaFilters>(fetchFn)

  const fetchMedia = useCallback(
    (params: MediaFilters & { reset?: boolean }) => fetchPage(params),
    [fetchPage],
  )

  return { ...rest, fetchMedia }
}
