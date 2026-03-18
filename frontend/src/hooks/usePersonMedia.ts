import { useMemo } from 'react'
import { getPersonMedia } from '#/api/client'
import { useInfiniteMediaQuery } from '#/hooks/useInfiniteMediaQuery'

export function usePersonMedia(
  personId: number | null,
  enabled = false,
  sort?: string,
  faces?: string | null,
) {
  const queryKey = useMemo(
    () => ['faces', 'persons', personId, 'media', { sort, faces }] as const,
    [personId, sort, faces],
  )

  return useInfiniteMediaQuery(
    queryKey,
    ({ pageParam }) =>
      getPersonMedia({
        personId: personId!,
        cursor: pageParam,
        limit: 50,
        sort,
        faces: faces ?? undefined,
      }),
    enabled && personId != null,
  )
}
