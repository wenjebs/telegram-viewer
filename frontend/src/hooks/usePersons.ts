import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPersons } from '#/api/client'

const QUERY_KEY = ['faces', 'persons'] as const

export function usePersons(enabled = false) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getPersons,
    enabled,
  })

  return {
    persons: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
    invalidate: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  }
}
