import { useState, useCallback, useEffect } from 'react'
import type { MediaItem } from '#/api/schemas'
import { getThumbnailUrl, getDownloadUrl } from '#/api/client'

interface Props {
  item: MediaItem
}

export default function LightboxMedia({ item }: Props) {
  const [thumbLoaded, setThumbLoaded] = useState(false)
  const [fullLoaded, setFullLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const isVideo = item.media_type === 'video'
  const thumbnailUrl = getThumbnailUrl(item.id, item.date)
  const downloadUrl = getDownloadUrl(item.id, item.date)
  const aspectRatio =
    item.width && item.height ? `${item.width} / ${item.height}` : '4 / 3'

  const showSkeleton = !thumbLoaded && !fullLoaded
  const showIndicator = thumbLoaded && !fullLoaded && !error
  const showError = error && !fullLoaded

  const handleThumbLoad = useCallback(() => setThumbLoaded(true), [])
  const handleFullLoad = useCallback(() => setFullLoaded(true), [])
  const handleFullError = useCallback(() => setError(true), [])
  const handleRetry = useCallback(() => {
    setError(false)
    setFullLoaded(false)
    setRetryKey((k) => k + 1)
  }, [])

  useEffect(() => {
    setThumbLoaded(false)
    setFullLoaded(false)
    setError(false)
    setRetryKey(0)
  }, [item.id])

  return (
    <div className="relative flex items-center justify-center">
      {/* Skeleton */}
      {showSkeleton && (
        <div
          data-testid="lightbox-skeleton"
          className="max-h-[85vh] max-w-[90vw] rounded"
          style={{
            aspectRatio,
            width: '60vw',
            backgroundImage:
              'linear-gradient(90deg, transparent 0%, var(--color-surface-alt) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.8s ease-in-out infinite',
            backgroundColor: 'var(--color-surface-strong)',
          }}
        />
      )}

      {/* Thumbnail layer */}
      {item.thumbnail_path && (
        <img
          data-testid="lightbox-thumbnail"
          src={thumbnailUrl}
          alt=""
          onLoad={handleThumbLoad}
          className={`max-h-[85vh] max-w-[90vw] rounded object-contain ${
            showSkeleton ? 'absolute inset-0 m-auto' : ''
          }`}
          style={{
            opacity: fullLoaded ? 0 : 1,
            transition: 'opacity 300ms ease-out',
          }}
        />
      )}

      {/* Full-resolution layer */}
      {isVideo ? (
        <video
          key={retryKey}
          data-testid="lightbox-full-video"
          src={downloadUrl}
          controls
          autoPlay
          onLoadedData={handleFullLoad}
          onError={handleFullError}
          className={`max-h-[85vh] max-w-[90vw] rounded object-contain ${
            thumbLoaded ? 'absolute inset-0 m-auto' : ''
          }`}
          style={{
            opacity: fullLoaded ? 1 : 0,
            transition: 'opacity 300ms ease-out',
          }}
        />
      ) : (
        <img
          key={retryKey}
          data-testid="lightbox-full"
          src={downloadUrl}
          alt={item.caption || ''}
          onLoad={handleFullLoad}
          onError={handleFullError}
          className={`max-h-[85vh] max-w-[90vw] rounded object-contain ${
            thumbLoaded ? 'absolute inset-0 m-auto' : ''
          }`}
          style={{
            opacity: fullLoaded ? 1 : 0,
            transition: 'opacity 300ms ease-out',
          }}
        />
      )}

      {/* Loading indicator pill */}
      {showIndicator && (
        <div
          data-testid="lightbox-loading-indicator"
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1.5"
          style={{
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/15 border-t-white/60" />
          <span className="text-[11px] text-white/50">
            Loading full resolution
          </span>
        </div>
      )}

      {/* Error pill */}
      {showError && (
        <button
          data-testid="lightbox-error-indicator"
          onClick={handleRetry}
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1.5 transition-colors hover:border-white/20"
          style={{
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <svg
            className="h-3.5 w-3.5 text-white/50"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M2 8a6 6 0 0 1 10.2-4.3M14 8a6 6 0 0 1-10.2 4.3" />
            <path d="M12 2v3h-3M4 14v-3h3" />
          </svg>
          <span className="text-[11px] text-white/50">Failed to load</span>
        </button>
      )}
    </div>
  )
}
