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
}

export default function Lightbox({
  item,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
    },
    [onClose, onPrev, onNext, hasPrev, hasNext],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

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

        <div className="mt-3 flex justify-center">
          <button
            className="rounded-md border border-neutral-600 px-6 py-2 text-sm text-white hover:bg-neutral-800"
            onClick={handleDownload}
          >
            Download
          </button>
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
