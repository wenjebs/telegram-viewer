import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getDownloadUrl } from '#/api/client'
import type { MediaItem } from '#/api/schemas'

const MAX_CONCURRENT = 3

interface QueueEntry {
  id: number
  date: string
}

export function usePrefetch(items: MediaItem[], enabled: boolean) {
  const queryClient = useQueryClient()
  const activeRef = useRef(0)
  const queueRef = useRef<QueueEntry[]>([])
  const controllerRef = useRef<AbortController | null>(null)

  const processQueue = useCallback(() => {
    const controller = controllerRef.current
    if (!controller) return

    while (queueRef.current.length > 0 && activeRef.current < MAX_CONCURRENT) {
      const entry = queueRef.current.shift()!
      activeRef.current++

      queryClient
        .prefetchQuery({
          queryKey: ['media-prefetch', entry.id],
          queryFn: () =>
            fetch(getDownloadUrl(entry.id, entry.date), {
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
    const queued = new Set(queueRef.current.map((e) => e.id))
    const newEntries = items
      .filter(
        (item) =>
          !queued.has(item.id) &&
          !queryClient.getQueryData(['media-prefetch', item.id]),
      )
      .map((item) => ({ id: item.id, date: item.date }))

    if (newEntries.length > 0) {
      queueRef.current.unshift(...newEntries)
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
