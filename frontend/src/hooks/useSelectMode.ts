import { useState, useCallback, useRef } from 'react'
import type { MediaItem } from '#/api/types'

export function useSelectMode() {
  // #region State
  const [active, setActive] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const lastClickedIdRef = useRef<number | null>(null)
  // #endregion

  // #region Mode control
  const enterSelectMode = useCallback((initialId?: number) => {
    setActive(true)
    if (initialId != null) {
      setSelectedIds(new Set([initialId]))
      lastClickedIdRef.current = initialId
    }
  }, [])

  const exitSelectMode = useCallback(() => {
    setActive(false)
    setSelectedIds(new Set())
    lastClickedIdRef.current = null
  }, [])
  // #endregion

  // #region Selection operations
  const toggle = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    lastClickedIdRef.current = id
  }, [])

  const toggleRange = useCallback(
    (id: number, items: MediaItem[]) => {
      const anchor = lastClickedIdRef.current
      if (anchor == null) {
        // No anchor, just toggle single
        toggle(id)
        return
      }
      const anchorIdx = items.findIndex((i) => i.id === anchor)
      const targetIdx = items.findIndex((i) => i.id === id)
      if (anchorIdx === -1 || targetIdx === -1) {
        toggle(id)
        return
      }
      const start = Math.min(anchorIdx, targetIdx)
      const end = Math.max(anchorIdx, targetIdx)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (let i = start; i <= end; i++) {
          next.add(items[i].id)
        }
        return next
      })
      lastClickedIdRef.current = id
    },
    [toggle],
  )

  const selectAll = useCallback((items: MediaItem[]) => {
    setSelectedIds(new Set(items.map((i) => i.id)))
  }, [])

  const selectDateGroup = useCallback((items: MediaItem[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = items.every((i) => next.has(i.id))
      if (allSelected) {
        for (const i of items) next.delete(i.id)
      } else {
        for (const i of items) next.add(i.id)
      }
      return next
    })
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
    lastClickedIdRef.current = null
  }, [])

  const isSelected = useCallback(
    (id: number) => selectedIds.has(id),
    [selectedIds],
  )
  // #endregion

  return {
    active,
    selectedIds,
    selectedCount: selectedIds.size,
    enterSelectMode,
    exitSelectMode,
    toggle,
    toggleRange,
    selectAll,
    selectDateGroup,
    deselectAll,
    isSelected,
  }
}
