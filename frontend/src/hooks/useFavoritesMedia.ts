import { useCallback } from 'react'
import { getFavoritesMedia } from '#/api/client'
import { usePaginatedMedia } from './usePaginatedMedia'

export function useFavoritesMedia() {
  const fetchFn = useCallback(
    (params: { cursor?: number; limit?: number }) => getFavoritesMedia(params),
    [],
  )

  const { fetchPage, ...rest } = usePaginatedMedia(fetchFn)

  const fetchFavorites = useCallback(
    (params: { reset?: boolean }) => fetchPage(params),
    [fetchPage],
  )

  return { ...rest, fetchFavorites }
}
