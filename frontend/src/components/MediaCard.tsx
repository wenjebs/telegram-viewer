import { useRef, useCallback } from 'react'
import type { MediaItem } from '#/api/types'
import { getThumbnailUrl } from '#/api/client'

interface Props {
  item: MediaItem
  onClick: (e: React.MouseEvent) => void
  selectMode?: boolean
  selected?: boolean
  onLongPress?: () => void
}

export default function MediaCard({
  item,
  onClick,
  selectMode = false,
  selected = false,
  onLongPress,
}: Props) {
  const isVideo = item.media_type === 'video'

  // #region Long-press detection
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const longPressTriggered = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onLongPress) return
      longPressTriggered.current = false
      startPos.current = { x: e.clientX, y: e.clientY }
      timerRef.current = setTimeout(() => {
        longPressTriggered.current = true
        onLongPress()
      }, 300)
    },
    [onLongPress],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPos.current) return
      const dx = e.clientX - startPos.current.x
      const dy = e.clientY - startPos.current.y
      if (dx * dx + dy * dy > 100) {
        clearTimer()
      }
    },
    [clearTimer],
  )

  const handlePointerUp = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (longPressTriggered.current) {
        longPressTriggered.current = false
        e.preventDefault()
        return
      }
      onClick(e)
    },
    [onClick],
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onLongPress) return
      e.preventDefault()
      if (!selectMode) {
        onLongPress()
      }
    },
    [onLongPress, selectMode],
  )
  // #endregion

  // #region Render
  return (
    <div
      data-item-id={item.id}
      className={`relative aspect-square cursor-pointer overflow-hidden rounded bg-neutral-800 transition-all${
        selectMode && selected
          ? ' ring-2 ring-blue-500 ring-offset-1 ring-offset-neutral-900'
          : ''
      }${selectMode && !selected ? ' opacity-60' : ''}`}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={handleContextMenu}
    >
      <img
        src={getThumbnailUrl(item.id)}
        alt={item.caption || ''}
        loading="lazy"
        draggable={false}
        className="h-full w-full object-cover"
      />
      {isVideo && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-3xl text-white drop-shadow-lg">
          &#9654;
        </div>
      )}
      {isVideo && item.duration != null && (
        <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
          {formatDuration(item.duration)}
        </div>
      )}
      {/* Select mode checkbox */}
      {selectMode && (
        <div
          className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors${
            selected
              ? ' border-blue-500 bg-blue-500 text-white'
              : ' border-white/60 bg-black/40'
          }`}
        >
          {selected && (
            <svg
              className="h-3 w-3"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 6l3 3 5-5" />
            </svg>
          )}
        </div>
      )}
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
