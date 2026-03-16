import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getDownloadUrl } from '#/api/client'
import type { MediaItem } from '#/api/schemas'

const MAX_CONCURRENT = 3

export function usePrefetch(items: MediaItem[], enabled: boolean) {
  const queryClient = useQueryClient()
  const activeRef = useRef(0)
  const queueRef = useRef<number[]>([])
  const controllerRef = useRef<AbortController | null>(null)

  const processQueue = useCallback(() => {
    const controller = controllerRef.current
    if (!controller) return

    while (queueRef.current.length > 0 && activeRef.current < MAX_CONCURRENT) {
      const id = queueRef.current.shift()!
      activeRef.current++

      queryClient
        .prefetchQuery({
          queryKey: ['media-prefetch', id],
          queryFn: () =>
            fetch(getDownloadUrl(id), {
              signal: controller.signal,
            }).then((r) => {
              if (!r.ok) throw new Error(`${r.status}`)
              return r.blob().then(() => true)
            }),
          staleTime: Infinity,
          gcTime: Infinity,
        })
        .finally(() => {
          activeRef.current--
          processQueue()
        })
    }
  }, [queryClient])

  useEffect(() => {
    if (!enabled) return

    if (!controllerRef.current) {
      controllerRef.current = new AbortController()
    }

    // Append only new IDs (not already queued or cached)
    const queued = new Set(queueRef.current)
    const newIds = items
      .filter(
        (item) =>
          !queued.has(item.id) &&
          !queryClient.getQueryData(['media-prefetch', item.id]),
      )
      .map((item) => item.id)

    if (newIds.length > 0) {
      queueRef.current.unshift(...newIds)
      processQueue()
    }

    // Cleanup only on unmount / disabled
    return () => {
      controllerRef.current?.abort()
      controllerRef.current = null
      queueRef.current = []
      activeRef.current = 0
    }
  }, [items, enabled, queryClient, processQueue])
}
