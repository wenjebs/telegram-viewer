import { useState, useRef, useCallback, useEffect } from 'react'
import { startSyncAll, getSyncStatus } from '#/api/client'
import type { SyncStatus } from '#/api/schemas'

interface SyncPollingOptions {
  displayGroupIdsRef: React.RefObject<number[]>
  mediaTypeFilterRef: React.RefObject<string | null>
  dateFromRef: React.RefObject<string | undefined>
  dateToRef: React.RefObject<string | undefined>
  onSyncComplete: () => void
}

export function useSyncPolling({
  displayGroupIdsRef,
  onSyncComplete,
}: SyncPollingOptions) {
  const [syncing, setSyncing] = useState(false)
  const [syncStatuses, setSyncStatuses] = useState<Record<number, SyncStatus>>(
    {},
  )
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const handleSync = useCallback(
    async (activeGroupIds: number[]) => {
      if (activeGroupIds.length === 0) return
      setSyncing(true)
      try {
        await startSyncAll(activeGroupIds)
      } catch {
        setSyncing(false)
        return
      }

      stopPolling()
      pollRef.current = setInterval(async () => {
        const currentIds = displayGroupIdsRef.current
        const statuses: Record<number, SyncStatus> = {}
        await Promise.all(
          currentIds.map(async (gid) => {
            try {
              statuses[gid] = await getSyncStatus(gid)
            } catch {
              statuses[gid] = {
                status: 'error',
                progress: 0,
                total: 0,
              }
            }
          }),
        )
        setSyncStatuses(statuses)

        const allDone = currentIds.every(
          (gid) =>
            statuses[gid]?.status === 'done' ||
            statuses[gid]?.status === 'error',
        )
        if (allDone) {
          stopPolling()
          setSyncing(false)
          onSyncComplete()
        }
      }, 2000)
    },
    [stopPolling, displayGroupIdsRef, onSyncComplete],
  )

  return { syncing, syncStatuses, handleSync, stopPolling }
}
