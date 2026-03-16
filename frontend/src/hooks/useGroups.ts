import { useState, useEffect, useCallback } from 'react'
import type { Group } from '#/api/types'
import { getGroups, toggleGroupActive } from '#/api/client'

export function useGroups() {
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
    fetchGroups()
  }, [fetchGroups])

  const toggleActive = async (group: Group) => {
    const newActive = !group.active
    await toggleGroupActive(group.id, newActive, group.name)
    setGroups((prev) =>
      prev.map((g) => (g.id === group.id ? { ...g, active: newActive } : g)),
    )
  }

  const activeGroupIds = groups.filter((g) => g.active).map((g) => g.id)

  return {
    groups,
    loading,
    error,
    toggleActive,
    activeGroupIds,
    refetch: fetchGroups,
  }
}
