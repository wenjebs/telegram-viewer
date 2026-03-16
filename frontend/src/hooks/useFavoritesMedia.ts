import { useMemo, useCallback } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaPage } from '#/api/schemas'
import { getFavoritesMedia } from '#/api/client'

const QUERY_KEY = ['media', 'favorites'] as const

export function useFavoritesMedia(enabled = false) {
  const queryClient = useQueryClient()

  const query = useInfiniteQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ pageParam }) =>
      getFavoritesMedia({ cursor: pageParam, limit: 50 }),
    getNextPageParam: (lastPage: MediaPage) =>
      lastPage.next_cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled,
  })

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  )

  const removeItems = useCallback(
    (ids: number[]) => {
      const idSet = new Set(ids)
      queryClient.setQueryData(QUERY_KEY, (old: typeof query.data) => {
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
    [queryClient],
  )

  return {
    items,
    loading: query.isLoading || query.isFetchingNextPage,
    error: query.error ? String(query.error) : null,
    hasMore: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    removeItems,
  }
}
