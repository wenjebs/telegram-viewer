import { useEffect, useCallback } from 'react'
import type { MediaItem } from '#/api/types'
import { getDownloadUrl } from '#/api/client'

interface Props {
  item: MediaItem
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
  selected?: boolean
  favorited?: boolean
  onToggleSelect?: () => void
  onHide?: () => void
  onUnhide?: () => void
  onToggleFavorite?: () => void
}

export default function Lightbox({
  item,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  selected = false,
  favorited = false,
  onToggleSelect,
  onHide,
  onUnhide,
  onToggleFavorite,
}: Props) {
  // #region Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'ArrowLeft' && hasPrev) {
        e.stopPropagation()
        onPrev()
      }
      if (e.key === 'ArrowRight' && hasNext) {
        e.stopPropagation()
        onNext()
      }
      if (e.key === 's' || e.key === 'S') {
        e.stopPropagation()
        onToggleSelect?.()
      }
      if (e.key === 'h' || e.key === 'H') {
        e.stopPropagation()
        onHide?.()
        onUnhide?.()
      }
      if (e.key === 'f' || e.key === 'F') {
        e.stopPropagation()
        onToggleFavorite?.()
      }
    },
    [
      onClose,
      onPrev,
      onNext,
      hasPrev,
      hasNext,
      onToggleSelect,
      onHide,
      onUnhide,
      onToggleFavorite,
    ],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
  // #endregion

  const downloadUrl = getDownloadUrl(item.id)
  const isVideo = item.media_type === 'video'

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = ''
    a.click()
  }

  const navBtnCls =
    'absolute top-1/2 -translate-y-1/2 rounded bg-black/50 px-3 py-4 text-2xl text-white hover:bg-black/70'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute -top-8 right-0 text-xl text-white"
          onClick={onClose}
        >
          &times;
        </button>

        {hasPrev && (
          <button className={`${navBtnCls} -left-14`} onClick={onPrev}>
            &#8249;
          </button>
        )}
        {hasNext && (
          <button className={`${navBtnCls} -right-14`} onClick={onNext}>
            &#8250;
          </button>
        )}

        {/* Status indicators */}
        <div className="absolute top-3 left-3 z-10 flex gap-2">
          {selected && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-blue-500 bg-blue-500 text-white shadow-lg">
              <svg
                className="h-4 w-4"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2 6l3 3 5-5" />
              </svg>
            </div>
          )}
          {favorited && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/90 text-white shadow-lg">
              &#9829;
            </div>
          )}
        </div>

        {isVideo ? (
          <video
            src={downloadUrl}
            controls
            autoPlay
            className="max-h-[85vh] max-w-[90vw] rounded object-contain"
          />
        ) : (
          <img
            src={downloadUrl}
            alt={item.caption || ''}
            className="max-h-[85vh] max-w-[90vw] rounded object-contain"
          />
        )}

        {/* Media info */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-neutral-400">
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 uppercase">
            {item.media_type}
          </span>
          {item.mime_type && <span>{item.mime_type}</span>}
          {item.sender_name && (
            <span>
              from <span className="text-neutral-200">{item.sender_name}</span>
            </span>
          )}
          <span>
            in <span className="text-neutral-200">{item.chat_name}</span>
          </span>
          <span>
            {new Date(item.date).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
          {item.file_size != null && (
            <span>{formatFileSize(item.file_size)}</span>
          )}
          {item.width != null && item.height != null && (
            <span>
              {item.width}&times;{item.height}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-center gap-3">
          <button
            className="rounded-md border border-neutral-600 px-6 py-2 text-sm text-white hover:bg-neutral-800"
            onClick={handleDownload}
          >
            Download
          </button>
          {onToggleSelect && (
            <button
              className={`rounded-md border px-4 py-2 text-sm ${
                selected
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                  : 'border-neutral-600 text-white hover:bg-neutral-800'
              }`}
              onClick={onToggleSelect}
            >
              {selected ? 'Selected' : 'Select'}{' '}
              <span className="text-xs text-neutral-500">S</span>
            </button>
          )}
          {onToggleFavorite && (
            <button
              className={`rounded-md border px-4 py-2 text-sm ${
                favorited
                  ? 'border-red-500 bg-red-500/20 text-red-300'
                  : 'border-neutral-600 text-white hover:bg-neutral-800'
              }`}
              onClick={onToggleFavorite}
            >
              {favorited ? '♥' : '♡'}{' '}
              <span className="text-xs text-neutral-500">F</span>
            </button>
          )}
          {onHide && (
            <button
              className="rounded-md border border-neutral-600 px-4 py-2 text-sm text-white hover:bg-neutral-800"
              onClick={onHide}
            >
              Hide <span className="text-xs text-neutral-500">H</span>
            </button>
          )}
          {onUnhide && (
            <button
              className="rounded-md border border-emerald-600 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-900/30"
              onClick={onUnhide}
            >
              Unhide <span className="text-xs text-neutral-500">H</span>
            </button>
          )}
        </div>

        {item.caption && (
          <p className="mt-2 text-center text-sm text-neutral-400">
            {item.caption}
          </p>
        )}
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
