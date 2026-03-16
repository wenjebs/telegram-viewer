import { useState, useCallback, useRef } from 'react'
import type { MediaItem } from '#/api/types'
import { getHiddenMedia } from '#/api/client'

export function useHiddenMedia() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const cursorRef = useRef(nextCursor)
  cursorRef.current = nextCursor
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHidden = useCallback(async (params: { reset?: boolean }) => {
    setLoading(true)
    try {
      const cursor = params.reset ? undefined : (cursorRef.current ?? undefined)
      const data = await getHiddenMedia({ cursor, limit: 50 })
      setItems((prev) => (params.reset ? data.items : [...prev, ...data.items]))
      setNextCursor(data.next_cursor)
      cursorRef.current = data.next_cursor
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setItems([])
    setNextCursor(null)
  }, [])

  const removeItems = useCallback((ids: number[]) => {
    const idSet = new Set(ids)
    setItems((prev) => prev.filter((item) => !idSet.has(item.id)))
  }, [])

  return {
    items,
    loading,
    error,
    hasMore: nextCursor !== null,
    fetchHidden,
    reset,
    removeItems,
  }
}
