import { useMemo, useCallback } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaPage } from '#/api/schemas'
import { getPersonMedia } from '#/api/client'

export function usePersonMedia(personId: number | null, enabled = false) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => ['faces', 'persons', personId, 'media'] as const,
    [personId],
  )

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      getPersonMedia({
        personId: personId!,
        cursor: pageParam,
        limit: 50,
      }),
    getNextPageParam: (lastPage: MediaPage) =>
      lastPage.next_cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled: enabled && personId != null,
  })

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
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
    removeItems,
  }
}
