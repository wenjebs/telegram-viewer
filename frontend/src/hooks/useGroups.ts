import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Group } from '#/api/schemas'
import { getGroups, toggleGroupActive } from '#/api/client'

export function useGroups(enabled = true) {
  const queryClient = useQueryClient()
  const [displayGroupIds, setDisplayGroupIds] = useState<Set<number>>(new Set())

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

  const activeGroupIds = useMemo(
    () => groups.filter((g) => g.active).map((g) => g.id),
    [groups],
  )

  useEffect(() => {
    setDisplayGroupIds((prev) => {
      const activeSet = new Set(activeGroupIds)
      const next = new Set([...prev].filter((id) => activeSet.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [activeGroupIds])

  const toggleDisplayFilter = useCallback((groupId: number) => {
    setDisplayGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }, [])

  const clearDisplayFilter = useCallback(() => {
    setDisplayGroupIds(new Set())
  }, [])

  const displayFilteredGroupIds = useMemo(
    () =>
      displayGroupIds.size === 0
        ? activeGroupIds
        : activeGroupIds.filter((id) => displayGroupIds.has(id)),
    [activeGroupIds, displayGroupIds],
  )

  return {
    groups,
    loading,
    error: error ? String(error) : null,
    toggleActive,
    activeGroupIds,
    displayGroupIds,
    displayFilteredGroupIds,
    toggleDisplayFilter,
    clearDisplayFilter,
    refetch,
  }
}
