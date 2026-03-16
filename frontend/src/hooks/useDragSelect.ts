import { useState, useCallback, useRef, useEffect } from 'react'

interface Options {
  containerRef: React.RefObject<HTMLElement | null>
  selectMode: boolean
  enterSelectMode: () => void
  setSelection: (ids: Set<number>) => void
  selectedIds: Set<number>
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const DRAG_THRESHOLD = 5
const SCROLL_EDGE = 40
const SCROLL_MAX_SPEED = 15

function rectsIntersect(
  a: { left: number; right: number; top: number; bottom: number },
  b: DOMRect,
) {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  )
}

export function useDragSelect({
  containerRef,
  selectMode,
  enterSelectMode,
  setSelection,
  selectedIds,
}: Options) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null)

  const dragActive = useRef(false)
  const thresholdCrossed = useRef(false)
  const startViewport = useRef({ x: 0, y: 0 })
  const startScrollTop = useRef(0)
  const currentViewport = useRef({ x: 0, y: 0 })
  const baseSelection = useRef<Set<number>>(new Set())
  const pointerId = useRef<number | null>(null)
  const scrollTimerId = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafId = useRef<number | null>(null)
  const selectModeRef = useRef(selectMode)
  selectModeRef.current = selectMode
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds

  const stopAutoScroll = useCallback(() => {
    if (scrollTimerId.current != null) {
      clearInterval(scrollTimerId.current)
      scrollTimerId.current = null
    }
  }, [])

  const getSelectionViewportRect = useCallback(() => {
    const container = containerRef.current
    if (!container) return null
    const scrollDelta = container.scrollTop - startScrollTop.current
    const startY = startViewport.current.y - scrollDelta
    const startX = startViewport.current.x
    const curX = currentViewport.current.x
    const curY = currentViewport.current.y
    const x = Math.min(startX, curX)
    const y = Math.min(startY, curY)
    return {
      x,
      y,
      w: Math.abs(curX - startX),
      h: Math.abs(curY - startY),
    }
  }, [containerRef])

  const hitTest = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const rect = getSelectionViewportRect()
    if (!rect) return

    const bounds = {
      left: rect.x,
      right: rect.x + rect.w,
      top: rect.y,
      bottom: rect.y + rect.h,
    }

    const dragIds = new Set<number>()
    const cards = container.querySelectorAll('[data-item-id]')
    for (const card of cards) {
      const r = card.getBoundingClientRect()
      if (rectsIntersect(bounds, r)) {
        dragIds.add(Number(card.getAttribute('data-item-id')))
      }
    }

    const merged = new Set(baseSelection.current)
    for (const id of dragIds) merged.add(id)
    setSelection(merged)
  }, [containerRef, getSelectionViewportRect, setSelection])

  const updateRect = useCallback(() => {
    const rect = getSelectionViewportRect()
    if (rect) setSelectionRect(rect)
    hitTest()
  }, [getSelectionViewportRect, hitTest])

  const startAutoScroll = useCallback(() => {
    stopAutoScroll()
    scrollTimerId.current = setInterval(() => {
      const container = containerRef.current
      if (!container || !thresholdCrossed.current) return

      const containerRect = container.getBoundingClientRect()
      const y = currentViewport.current.y
      let speed = 0

      if (y < containerRect.top + SCROLL_EDGE) {
        const dist = containerRect.top + SCROLL_EDGE - y
        speed = -(dist / SCROLL_EDGE) * SCROLL_MAX_SPEED
      } else if (y > containerRect.bottom - SCROLL_EDGE) {
        const dist = y - (containerRect.bottom - SCROLL_EDGE)
        speed = (dist / SCROLL_EDGE) * SCROLL_MAX_SPEED
      }

      if (speed !== 0) {
        container.scrollTop += speed
        updateRect()
      }
    }, 16)
  }, [containerRef, stopAutoScroll, updateRect])

  const endDrag = useCallback(
    (e?: React.PointerEvent) => {
      if (e && pointerId.current != null && containerRef.current) {
        try {
          containerRef.current.releasePointerCapture(pointerId.current)
        } catch {
          // ignore if capture was already released
        }
      }
      dragActive.current = false
      thresholdCrossed.current = false
      pointerId.current = null
      setIsDragging(false)
      setSelectionRect(null)
      stopAutoScroll()
      if (rafId.current != null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
    },
    [containerRef, stopAutoScroll],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      // Don't start drag on interactive elements
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A') return

      dragActive.current = true
      thresholdCrossed.current = false
      pointerId.current = e.pointerId
      startViewport.current = { x: e.clientX, y: e.clientY }
      startScrollTop.current = containerRef.current?.scrollTop ?? 0
      currentViewport.current = { x: e.clientX, y: e.clientY }

      // Snapshot base selection
      if (e.shiftKey) {
        baseSelection.current = new Set(selectedIdsRef.current)
      } else {
        baseSelection.current = new Set()
      }
    },
    [containerRef],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragActive.current) return

      currentViewport.current = { x: e.clientX, y: e.clientY }

      if (!thresholdCrossed.current) {
        const dx = e.clientX - startViewport.current.x
        const dy = e.clientY - startViewport.current.y
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return

        e.preventDefault()
        thresholdCrossed.current = true
        setIsDragging(true)

        // Capture pointer on the container
        if (containerRef.current && pointerId.current != null) {
          containerRef.current.setPointerCapture(pointerId.current)
        }

        if (!selectModeRef.current) {
          enterSelectMode()
        }

        startAutoScroll()
      }

      if (rafId.current != null) cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(updateRect)
    },
    [containerRef, enterSelectMode, startAutoScroll, updateRect],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      endDrag(e)
    },
    [endDrag],
  )

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      endDrag(e)
    },
    [endDrag],
  )

  // Abort drag if select mode is deactivated externally
  useEffect(() => {
    if (!selectMode && dragActive.current) {
      endDrag()
    }
  }, [selectMode, endDrag])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll()
      if (rafId.current != null) cancelAnimationFrame(rafId.current)
    }
  }, [stopAutoScroll])

  return {
    isDragging,
    selectionRect,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  }
}
