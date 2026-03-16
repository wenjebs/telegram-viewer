import type { MediaItem } from '#/api/types'
import { getThumbnailUrl } from '#/api/client'

interface Props {
  item: MediaItem
  onClick: () => void
}

export default function MediaCard({ item, onClick }: Props) {
  const isVideo = item.media_type === 'video'

  return (
    <div
      className="relative aspect-square cursor-pointer overflow-hidden rounded bg-neutral-800"
      onClick={onClick}
    >
      <img
        src={getThumbnailUrl(item.id)}
        alt={item.caption || ''}
        loading="lazy"
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
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
