import { useState, useCallback, useRef } from 'react'
import type { MediaItem } from '#/api/types'
import { getMedia } from '#/api/client'

export function useMedia() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const cursorRef = useRef(nextCursor)
  cursorRef.current = nextCursor
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMedia = useCallback(
    async (params: {
      groups?: number[]
      type?: string
      dateFrom?: string
      dateTo?: string
      reset?: boolean
    }) => {
      setLoading(true)
      try {
        const cursor = params.reset
          ? undefined
          : (cursorRef.current ?? undefined)
        const data = await getMedia({
          cursor,
          limit: 50,
          groups: params.groups,
          type: params.type,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
        })
        setItems((prev) =>
          params.reset ? data.items : [...prev, ...data.items],
        )
        setNextCursor(data.next_cursor)
        cursorRef.current = data.next_cursor
        setError(null)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setItems([])
    setNextCursor(null)
  }, [])

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  return {
    items,
    loading,
    error,
    hasMore: nextCursor !== null,
    fetchMedia,
    reset,
    removeItem,
  }
}
