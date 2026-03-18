import { useMemo, useCallback } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaPage } from '#/api/schemas'

export function useInfiniteMediaQuery(
  queryKey: readonly unknown[],
  queryFn: (context: { pageParam: string | undefined }) => Promise<MediaPage>,
  enabled = true,
) {
  const queryClient = useQueryClient()

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => queryFn({ pageParam }),
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
