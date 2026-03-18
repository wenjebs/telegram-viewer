import { useMemo } from 'react'
import { getFavoritesMedia } from '#/api/client'
import { useInfiniteMediaQuery } from '#/hooks/useInfiniteMediaQuery'

export function useFavoritesMedia(enabled = false, sort?: string) {
  const queryKey = useMemo(
    () => ['media', 'favorites', { sort }] as const,
    [sort],
  )

  return useInfiniteMediaQuery(
    queryKey,
    ({ pageParam }) =>
      getFavoritesMedia({ cursor: pageParam, limit: 50, sort }),
    enabled,
  )
}
