import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { startFaceScan, getFaceScanStatus } from '#/api/client'
import type { FaceScanStatus } from '#/api/schemas'

export function useFaceScan({
  onScanComplete,
}: {
  onScanComplete: () => void
}) {
  const [scanning, setScanning] = useState(false)

  const scanMutation = useMutation({
    mutationFn: (force: boolean) => startFaceScan(force),
    onSuccess: () => setScanning(true),
    onError: () => toast.error('Failed to start face scan'),
  })

  const { data: status } = useQuery({
    queryKey: ['faceScanStatus'],
    queryFn: getFaceScanStatus,
    enabled: scanning,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 2000
      return data.status === 'done' || data.status === 'error' ? false : 2000
    },
  })

  useEffect(() => {
    if (!scanning || !status) return
    if (status.status === 'done' || status.status === 'error') {
      setScanning(false)
      if (status.status === 'done') onScanComplete()
    }
  }, [scanning, status, onScanComplete])

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
  }
}
