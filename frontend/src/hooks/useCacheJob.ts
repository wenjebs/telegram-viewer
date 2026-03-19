import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getCacheStatus,
  startCacheJob,
  pauseCacheJob,
  cancelCacheJob,
} from '#/api/client'
import type { CacheJobStatus } from '#/api/schemas'

export function useCacheJob() {
  const qc = useQueryClient()

  const { data: status } = useQuery({
    queryKey: ['cacheJobStatus'],
    queryFn: getCacheStatus,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'running' ? 3000 : false
    },
  })

  const startMutation = useMutation({
    mutationFn: startCacheJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cacheJobStatus'] }),
    onError: () => toast.error('Failed to start caching'),
  })

  const pauseMutation = useMutation({
    mutationFn: pauseCacheJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cacheJobStatus'] }),
    onError: () => toast.error('Failed to pause caching'),
  })

  const cancelMutation = useMutation({
    mutationFn: cancelCacheJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cacheJobStatus'] }),
    onError: () => toast.error('Failed to cancel caching'),
  })

  const start = useCallback(() => startMutation.mutate(), [startMutation])
  const pause = useCallback(() => pauseMutation.mutate(), [pauseMutation])
  const cancel = useCallback(() => cancelMutation.mutate(), [cancelMutation])

  const isRunning = status?.status === 'running'
  const isPaused = status?.status === 'paused'
  const isCompleted = status?.status === 'completed'

  return {
    status: status as CacheJobStatus | undefined,
    start,
    pause,
    cancel,
    isRunning,
    isPaused,
    isCompleted,
  }
}
