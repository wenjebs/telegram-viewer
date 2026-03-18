import { useMemo } from 'react'
import { getHiddenMedia } from '#/api/client'
import { useInfiniteMediaQuery } from '#/hooks/useInfiniteMediaQuery'

export function useHiddenMedia(enabled = false, sort?: string) {
  const queryKey = useMemo(() => ['media', 'hidden', { sort }] as const, [sort])

  return useInfiniteMediaQuery(
    queryKey,
    ({ pageParam }) => getHiddenMedia({ cursor: pageParam, limit: 50, sort }),
    enabled,
  )
}
