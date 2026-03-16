import { useCallback } from 'react'
import { getHiddenMedia } from '#/api/client'
import { usePaginatedMedia } from './usePaginatedMedia'

export function useHiddenMedia() {
  const fetchFn = useCallback(
    (params: { cursor?: number; limit?: number }) => getHiddenMedia(params),
    [],
  )

  const { fetchPage, ...rest } = usePaginatedMedia(fetchFn)

  const fetchHidden = useCallback(
    (params: { reset?: boolean }) => fetchPage(params),
    [fetchPage],
  )

  return { ...rest, fetchHidden }
}
