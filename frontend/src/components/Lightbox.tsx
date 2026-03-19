import { useEffect, useRef } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import type { MediaItem } from '#/api/schemas'
import { getDownloadUrl } from '#/api/client'
import { formatDateShort, formatFileSize } from '#/utils/format'
import LightboxMedia from '#/components/LightboxMedia'

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
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  useHotkeys(
    'left',
    () => {
      if (hasPrev) onPrev()
    },
    [hasPrev, onPrev],
  )
  useHotkeys(
    'right',
    () => {
      if (hasNext) onNext()
    },
    [hasNext, onNext],
  )
  useHotkeys('s', () => onToggleSelect?.(), [onToggleSelect])
  useHotkeys(
    'h',
    () => {
      if (onHide) onHide()
      else if (onUnhide) onUnhide()
    },
    [onHide, onUnhide],
  )
  useHotkeys('f', () => onToggleFavorite?.(), [onToggleFavorite])

  const downloadUrl = getDownloadUrl(item.id, item.date)

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = ''
    a.click()
  }

  const navBtnCls =
    'absolute top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-2xl text-white hover:bg-black/70'

  return (
    <dialog
      ref={dialogRef}
      className="open:flex items-center justify-center backdrop:bg-black/90 bg-transparent p-0 m-0 max-w-none max-h-none w-screen h-screen"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close()
      }}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute -top-10 -right-2 p-2 text-xl text-white"
          onClick={onClose}
          aria-label="Close lightbox"
        >
          &times;
        </button>

        {hasPrev && (
          <button
            className={`${navBtnCls} left-2 sm:-left-14`}
            onClick={onPrev}
            aria-label="Previous item"
          >
            &#8249;
          </button>
        )}
        {hasNext && (
          <button
            className={`${navBtnCls} right-2 sm:-right-14`}
            onClick={onNext}
            aria-label="Next item"
          >
            &#8250;
          </button>
        )}

        {/* Status indicators */}
        <div className="absolute top-3 left-3 z-10 flex gap-2">
          {selected && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent bg-accent text-white shadow-lg">
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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-danger/90 text-white shadow-lg">
              &#9829;
            </div>
          )}
        </div>

        <LightboxMedia item={item} />

        {/* Media info */}
        <div className="mt-4 space-y-1 text-center">
          {/* Primary: who, where, when */}
          <div className="flex flex-wrap items-center justify-center gap-x-1.5 text-sm text-text">
            {item.sender_name && (
              <>
                <span className="font-medium">{item.sender_name}</span>
                <span className="text-text-soft">in</span>
              </>
            )}
            <span className="font-medium">{item.chat_name}</span>
            <span className="text-text-soft">&middot;</span>
            <span className="text-text-soft">{formatDateShort(item.date)}</span>
          </div>
          {/* Secondary: type, size, dimensions */}
          <div className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-text-soft">
            <span className="rounded bg-surface-alt px-1.5 py-0.5 font-medium uppercase">
              {item.media_type}
            </span>
            {item.mime_type && <span>{item.mime_type}</span>}
            {item.file_size != null && (
              <>
                <span>&middot;</span>
                <span>{formatFileSize(item.file_size)}</span>
              </>
            )}
            {item.width != null && item.height != null && (
              <>
                <span>&middot;</span>
                <span>
                  {item.width}&times;{item.height}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            onClick={handleDownload}
          >
            Download
          </button>
          {onToggleSelect && (
            <button
              className={`rounded-md border px-3 py-2 text-sm ${
                selected
                  ? 'border-accent bg-accent/20 text-accent'
                  : 'border-border-soft text-text-soft hover:bg-hover hover:text-text'
              }`}
              onClick={onToggleSelect}
              aria-label={selected ? 'Deselect (S)' : 'Select (S)'}
              title={selected ? 'Deselect (S)' : 'Select (S)'}
            >
              {selected ? '✓' : '☐'} Select
            </button>
          )}
          {onToggleFavorite && (
            <button
              className={`rounded-md border px-3 py-2 text-sm ${
                favorited
                  ? 'border-danger bg-danger/20 text-danger'
                  : 'border-border-soft text-text-soft hover:bg-hover hover:text-text'
              }`}
              onClick={onToggleFavorite}
              aria-label={favorited ? 'Unfavorite (F)' : 'Favorite (F)'}
              title={favorited ? 'Unfavorite (F)' : 'Favorite (F)'}
            >
              {favorited ? '\u2665' : '\u2661'} Favorite
            </button>
          )}
          {onHide && (
            <button
              className="rounded-md border border-border-soft px-3 py-2 text-sm text-text-soft hover:bg-hover hover:text-text"
              onClick={onHide}
              aria-label="Hide (H)"
              title="Hide (H)"
            >
              Hide
            </button>
          )}
          {onUnhide && (
            <button
              className="rounded-md border border-success px-3 py-2 text-sm text-success hover:bg-success/10"
              onClick={onUnhide}
              aria-label="Unhide (H)"
              title="Unhide (H)"
            >
              Unhide
            </button>
          )}
        </div>

        {item.caption && (
          <p className="mt-2 text-center text-sm text-text-soft">
            {item.caption}
          </p>
        )}
      </div>
    </dialog>
  )
}
