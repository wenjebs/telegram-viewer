import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Group } from '#/api/types'
import { getGroups, toggleGroupActive } from '#/api/client'

export function useGroups(enabled = true) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getGroups()
      setGroups(data)
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enabled) fetchGroups()
  }, [enabled, fetchGroups])

  const toggleActive = useCallback(async (group: Group) => {
    await toggleGroupActive(group.id, !group.active, group.name)
    setGroups((prev) =>
      prev.map((g) => (g.id === group.id ? { ...g, active: !g.active } : g)),
    )
  }, [])

  const activeGroupIds = useMemo(
    () => groups.filter((g) => g.active).map((g) => g.id),
    [groups],
  )

  return {
    groups,
    loading,
    error,
    toggleActive,
    activeGroupIds,
    refetch: fetchGroups,
  }
}
