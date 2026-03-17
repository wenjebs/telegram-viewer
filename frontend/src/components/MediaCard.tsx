import { useRef, useCallback } from 'react'
import { useLongPress } from 'use-long-press'
import type { MediaItem } from '#/api/schemas'
import { getThumbnailUrl } from '#/api/client'
import { formatDuration } from '#/utils/format'

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

  const longPressTriggered = useRef(false)

  const longPressHandlers = useLongPress(
    onLongPress
      ? () => {
          longPressTriggered.current = true
          onLongPress()
        }
      : null,
    {
      threshold: 300,
      cancelOnMovement: 10,
    },
  )()

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

  return (
    <div
      data-item-id={item.id}
      className={`relative aspect-square cursor-pointer overflow-hidden rounded bg-surface-alt transition-all${
        selectMode && selected
          ? ' ring-2 ring-blue-500 ring-offset-1 ring-offset-base'
          : ''
      }${selectMode && !selected ? ' opacity-60' : ''}`}
      onClick={handleClick}
      {...longPressHandlers}
      onContextMenu={handleContextMenu}
    >
      <img
        src={getThumbnailUrl(item.id, item.date)}
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
      <div className="absolute bottom-1 left-1 max-w-[calc(100%-3rem)] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">
        {item.chat_name}
      </div>
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
