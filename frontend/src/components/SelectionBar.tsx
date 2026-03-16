import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  unhideMediaBatch,
  hideMediaBatch,
  favoriteMediaBatch,
} from '#/api/client'
import { useZipDownload } from '#/hooks/useZipDownload'

interface Props {
  selectedCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onDownload: () => void
  onCancel: () => void
  selectedIds: Set<number>
  viewMode?: 'normal' | 'hidden' | 'favorites' | 'people'
  onUnhide?: () => void
  onHide?: () => void
  onFavorite?: () => void
}

export default function SelectionBar({
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onDownload,
  onCancel,
  selectedIds,
  viewMode = 'normal',
  onUnhide,
  onHide,
  onFavorite,
}: Props) {
  const [unhiding, setUnhiding] = useState(false)
  const [hiding, setHiding] = useState(false)
  const [favoriting, setFavoriting] = useState(false)

  const { preparing, zipStatus, startDownload } = useZipDownload({
    onComplete: onDownload,
  })

  // #region Actions
  const handleDownload = () => {
    if (selectedCount === 0 || preparing) return
    startDownload([...selectedIds])
  }

  const handleUnhide = async () => {
    if (selectedCount === 0 || unhiding) return
    setUnhiding(true)
    try {
      await unhideMediaBatch([...selectedIds])
      toast.success(`${selectedCount} items unhidden`)
      onUnhide?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unhide failed')
    } finally {
      setUnhiding(false)
    }
  }

  const handleHide = async () => {
    if (selectedCount === 0 || hiding) return
    setHiding(true)
    try {
      await hideMediaBatch([...selectedIds])
      toast.success(`${selectedCount} items hidden`)
      onHide?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hide failed')
    } finally {
      setHiding(false)
    }
  }

  const handleFavorite = async () => {
    if (selectedCount === 0 || favoriting) return
    setFavoriting(true)
    try {
      await favoriteMediaBatch([...selectedIds])
      onFavorite?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Favorite failed')
    } finally {
      setFavoriting(false)
    }
  }

  // Keyboard shortcuts
  const handleHideRef = useRef(handleHide)
  handleHideRef.current = handleHide
  const handleFavoriteRef = useRef(handleFavorite)
  handleFavoriteRef.current = handleFavorite

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'h' || e.key === 'H') {
      e.preventDefault()
      handleHideRef.current()
    }
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault()
      handleFavoriteRef.current()
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
  // #endregion

  // #region Render
  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 animate-[slideUp_150ms_ease-out]">
      <div className="flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900/95 px-5 py-2.5 shadow-2xl backdrop-blur-sm">
        <span className="text-sm text-neutral-300">
          <span className="font-semibold text-white">{selectedCount}</span>{' '}
          selected
        </span>
        <div className="h-4 w-px bg-neutral-700" />
        <button
          className="text-sm text-sky-400 hover:text-sky-300"
          onClick={onSelectAll}
        >
          Select all
        </button>
        {selectedCount > 0 && (
          <button
            className="text-sm text-sky-400 hover:text-sky-300"
            onClick={onDeselectAll}
          >
            Deselect
          </button>
        )}
        {viewMode === 'hidden' ? (
          <button
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            onClick={handleUnhide}
            disabled={selectedCount === 0 || unhiding}
          >
            {unhiding ? 'Unhiding...' : 'Unhide'}
          </button>
        ) : (
          <>
            <button
              className="rounded-lg bg-red-600/80 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              onClick={handleFavorite}
              disabled={selectedCount === 0 || favoriting}
            >
              {favoriting ? (
                'Saving...'
              ) : (
                <>
                  ♥ Favorite <span className="text-xs text-white/40">F</span>
                </>
              )}
            </button>
            <button
              className="rounded-lg bg-neutral-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-neutral-600 disabled:opacity-50"
              onClick={handleHide}
              disabled={selectedCount === 0 || hiding}
            >
              {hiding ? (
                'Hiding...'
              ) : (
                <>
                  Hide <span className="text-xs text-white/40">H</span>
                </>
              )}
            </button>
            <button
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              onClick={handleDownload}
              disabled={selectedCount === 0 || preparing}
            >
              {preparing ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="h-3.5 w-3.5 animate-spin"
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray="28"
                      strokeDashoffset="8"
                      strokeLinecap="round"
                    />
                  </svg>
                  {zipStatus?.status === 'zipping'
                    ? 'Building zip...'
                    : `${zipStatus?.files_ready ?? 0}/${zipStatus?.files_total ?? '?'}...`}
                </span>
              ) : (
                '↓ Download'
              )}
            </button>
          </>
        )}
        <button
          className="text-sm text-neutral-400 hover:text-neutral-200"
          onClick={onCancel}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
