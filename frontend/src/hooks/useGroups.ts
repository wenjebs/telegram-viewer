import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Group, PreviewCounts } from '#/api/schemas'
import {
  getGroups,
  getPreviewCounts,
  toggleGroupActive,
  unsyncGroup as unsyncGroupApi,
} from '#/api/client'

interface UseGroupsOptions {
  enabled?: boolean
}

export function useGroups({ enabled = true }: UseGroupsOptions = {}) {
  const queryClient = useQueryClient()

  const {
    data: groups = [],
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
    enabled,
  })

  const toggleActive = useCallback(
    async (group: Group) => {
      await toggleGroupActive(group.id, !group.active, group.name)
      queryClient.setQueryData<Group[]>(['groups'], (prev) =>
        prev?.map((g) => (g.id === group.id ? { ...g, active: !g.active } : g)),
      )
    },
    [queryClient],
  )

  const bulkSetActive = useCallback(
    async (targetGroups: Group[], active: boolean) => {
      const toChange = targetGroups.filter((g) => g.active !== active)
      if (toChange.length === 0) return
      await Promise.all(
        toChange.map((g) => toggleGroupActive(g.id, active, g.name)),
      )
      const ids = new Set(toChange.map((g) => g.id))
      queryClient.setQueryData<Group[]>(['groups'], (prev) =>
        prev?.map((g) => (ids.has(g.id) ? { ...g, active } : g)),
      )
    },
    [queryClient],
  )

  const unsyncGroup = useCallback(
    async (groupId: number) => {
      await unsyncGroupApi(groupId)
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['media'] })
      queryClient.invalidateQueries({ queryKey: ['counts'] })
      queryClient.invalidateQueries({ queryKey: ['preview-counts'] })
      queryClient.invalidateQueries({ queryKey: ['faces'] })
    },
    [queryClient],
  )

  const activeGroupIds = useMemo(
    () => groups.filter((g) => g.active).map((g) => g.id),
    [groups],
  )

  const { data: previewCounts = {} } = useQuery<PreviewCounts>({
    queryKey: ['preview-counts'],
    queryFn: getPreviewCounts,
    enabled: enabled && activeGroupIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  return {
    groups,
    loading,
    error: error ? String(error) : null,
    toggleActive,
    bulkSetActive,
    unsyncGroup,
    activeGroupIds,
    refetch,
    previewCounts,
  }
}
