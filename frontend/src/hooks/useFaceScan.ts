import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { startFaceScan, getFaceScanStatus } from '#/api/client'
import type { FaceScanStatus } from '#/api/schemas'

export function useFaceScan({
  onScanComplete,
}: {
  onScanComplete: () => void
}) {
  const [scanning, setScanning] = useState(false)
  const queryClient = useQueryClient()
  // After sync, poll a few extra times to catch an auto-triggered scan
  const postSyncPollRef = useRef(0)

  const scanMutation = useMutation({
    mutationFn: (force: boolean) => startFaceScan(force),
    onSuccess: () => setScanning(true),
    onError: () => toast.error('Failed to start face scan'),
  })

  const { data: status } = useQuery({
    queryKey: ['faceScanStatus'],
    queryFn: getFaceScanStatus,
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 2000
      if (data.status === 'scanning' || data.status === 'clustering')
        return 2000
      // Keep polling briefly after sync to detect auto-triggered scan
      if (postSyncPollRef.current > 0) {
        postSyncPollRef.current--
        return 2000
      }
      return false
    },
  })

  // Resume polling if we detect an in-progress scan (e.g. after page refresh)
  useEffect(() => {
    if (!status) return
    if (
      (status.status === 'scanning' || status.status === 'clustering') &&
      !scanning
    ) {
      setScanning(true)
    }
    if (scanning && (status.status === 'done' || status.status === 'error')) {
      setScanning(false)
      if (status.status === 'done') onScanComplete()
    }
  }, [scanning, status, onScanComplete])

  // Called after sync completes to start watching for auto-triggered scan
  const checkAfterSync = useCallback(() => {
    postSyncPollRef.current = 5
    queryClient.invalidateQueries({ queryKey: ['faceScanStatus'] })
  }, [queryClient])

  return {
    scanning,
    status:
      status ??
      ({
        status: 'idle',
        scanned: 0,
        total: 0,
        person_count: 0,
      } as FaceScanStatus),
    startScan: scanMutation.mutate,
    checkAfterSync,
  }
}
