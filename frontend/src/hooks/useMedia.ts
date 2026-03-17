import { useMemo, useCallback } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaPage } from '#/api/schemas'
import { getMedia } from '#/api/client'

export interface MediaFilters {
  groups?: number[]
  type?: string
  dateFrom?: string
  dateTo?: string
  faces?: string
}

export function useMedia(filters: MediaFilters, enabled = true) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['media', filters] as const, [filters])

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      getMedia({ ...filters, cursor: pageParam, limit: 50 }),
    getNextPageParam: (lastPage: MediaPage) =>
      lastPage.next_cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled,
  })

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  )

  const removeItem = useCallback(
    (id: number) => {
      queryClient.setQueryData(queryKey, (old: typeof query.data) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== id),
          })),
        }
      })
    },
    [queryClient, queryKey],
  )

  const removeItems = useCallback(
    (ids: number[]) => {
      const idSet = new Set(ids)
      queryClient.setQueryData(queryKey, (old: typeof query.data) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => !idSet.has(item.id)),
          })),
        }
      })
    },
    [queryClient, queryKey],
  )

  return {
    items,
    loading: query.isLoading || query.isFetchingNextPage,
    error: query.error ? String(query.error) : null,
    hasMore: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    removeItem,
    removeItems,
  }
}
