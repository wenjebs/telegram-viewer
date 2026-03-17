import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPersons, getSimilarGroups } from '#/api/client'

const PERSONS_KEY = ['faces', 'persons'] as const
const SIMILAR_PREFIX = ['faces', 'persons', 'similar-groups'] as const

export function usePersons(enabled = false, similarityThreshold = 0.4) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: PERSONS_KEY,
    queryFn: getPersons,
    enabled,
  })

  const threshold = similarityThreshold
  const similarQuery = useQuery({
    queryKey: [...SIMILAR_PREFIX, threshold] as const,
    queryFn: () => getSimilarGroups(threshold),
    enabled: enabled && (query.data?.length ?? 0) >= 2,
  })

  return {
    persons: query.data ?? [],
    loading: query.isLoading,
    similarGroups: similarQuery.data?.groups ?? [],
    refetch: query.refetch,
    invalidate: () => {
      queryClient.invalidateQueries({ queryKey: PERSONS_KEY })
      queryClient.invalidateQueries({ queryKey: SIMILAR_PREFIX })
    },
  }
}
