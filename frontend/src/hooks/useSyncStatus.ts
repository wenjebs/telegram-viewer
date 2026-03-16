import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { startSyncAll, getSyncStatus } from '#/api/client'
import type { SyncStatus } from '#/api/schemas'

export function useSyncStatus({
  onSyncComplete,
}: {
  onSyncComplete: () => void
}) {
  const [syncingGroupIds, setSyncingGroupIds] = useState<number[]>([])

  const syncMutation = useMutation({
    mutationFn: startSyncAll,
    onSuccess: (data) => setSyncingGroupIds(data.started),
    onError: () => toast.error('Failed to start sync'),
  })

  const { data: syncStatuses = {} } = useQuery({
    queryKey: ['syncStatus', syncingGroupIds],
    queryFn: async () => {
      const statuses: Record<number, SyncStatus> = {}
      await Promise.all(
        syncingGroupIds.map(async (gid) => {
          try {
            statuses[gid] = await getSyncStatus(gid)
          } catch {
            statuses[gid] = { status: 'error', progress: 0, total: 0 }
          }
        }),
      )
      return statuses
    },
    enabled: syncingGroupIds.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 2000
      const allDone = syncingGroupIds.every(
        (gid) => data[gid]?.status === 'done' || data[gid]?.status === 'error',
      )
      return allDone ? false : 2000
    },
  })

  useEffect(() => {
    if (syncingGroupIds.length === 0) return
    const allDone = syncingGroupIds.every(
      (gid) =>
        syncStatuses[gid]?.status === 'done' ||
        syncStatuses[gid]?.status === 'error',
    )
    if (allDone) {
      setSyncingGroupIds([])
      onSyncComplete()
    }
  }, [syncStatuses, syncingGroupIds, onSyncComplete])

  return {
    syncing: syncingGroupIds.length > 0,
    syncStatuses,
    handleSync: syncMutation.mutate,
  }
}
