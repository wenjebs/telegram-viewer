import { useMemo } from 'react'
import { getMedia } from '#/api/client'
import { useInfiniteMediaQuery } from '#/hooks/useInfiniteMediaQuery'

export interface MediaFilters {
  groups?: number[]
  type?: string
  dateFrom?: string
  dateTo?: string
  faces?: string
  sort?: string
}

export function useMedia(filters: MediaFilters, enabled = true) {
  const queryKey = useMemo(() => ['media', filters] as const, [filters])

  return useInfiniteMediaQuery(
    queryKey,
    ({ pageParam }) => getMedia({ ...filters, cursor: pageParam, limit: 50 }),
    enabled,
  )
}
