import { useState, useCallback } from 'react'
import type { MediaItem } from '#/api/types'
import { getMedia } from '#/api/client'

export function useMedia() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMedia = useCallback(
    async (params: { groups?: number[]; type?: string; reset?: boolean }) => {
      setLoading(true)
      try {
        const cursor = params.reset ? undefined : (nextCursor ?? undefined)
        const data = await getMedia({
          cursor,
          limit: 50,
          groups: params.groups,
          type: params.type,
        })
        setItems((prev) =>
          params.reset ? data.items : [...prev, ...data.items],
        )
        setNextCursor(data.next_cursor)
        setError(null)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [nextCursor],
  )

  const reset = () => {
    setItems([])
    setNextCursor(null)
  }

  return {
    items,
    loading,
    error,
    hasMore: nextCursor !== null,
    fetchMedia,
    reset,
  }
}
