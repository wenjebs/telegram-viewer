import { useState, useCallback, useRef } from 'react'
import type { MediaItem, MediaPage } from '#/api/types'

type FetchFn<P> = (
  params: P & { cursor?: number; limit?: number },
) => Promise<MediaPage>

export function usePaginatedMedia<P = Record<string, unknown>>(
  fetchFn: FetchFn<P>,
) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const cursorRef = useRef(nextCursor)
  cursorRef.current = nextCursor
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(
    async (params: P & { reset?: boolean }) => {
      setLoading(true)
      try {
        const { reset, ...rest } = params
        const cursor = reset ? undefined : (cursorRef.current ?? undefined)
        const data = await fetchFn({
          ...rest,
          cursor,
          limit: 50,
        } as P & { cursor?: number; limit?: number })
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]))
        setNextCursor(data.next_cursor)
        cursorRef.current = data.next_cursor
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [fetchFn],
  )

  const reset = useCallback(() => {
    setItems([])
    setNextCursor(null)
  }, [])

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
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
    fetchPage,
    reset,
    removeItem,
    removeItems,
  }
}
