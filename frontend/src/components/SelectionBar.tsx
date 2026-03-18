import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  unhideMediaBatch,
  hideMediaBatch,
  favoriteMediaBatch,
  unfavoriteMediaBatch,
} from '#/api/client'
import { useZipDownload } from '#/hooks/useZipDownload'

interface Props {
  selectedCount: number
  onSelectAll: () => Promise<void> | void
  onDeselectAll: () => void
  onDownload: () => void
  onCancel: () => void
  selectedIds: Set<number>
  viewMode?: 'normal' | 'hidden' | 'favorites' | 'people'
  onUnhide?: () => void
  onHide?: () => void
  onFavorite?: () => void
  onUnfavorite?: () => void
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
  onUnfavorite,
}: Props) {
  const [selectingAll, setSelectingAll] = useState(false)
  const [unhiding, setUnhiding] = useState(false)
  const [hiding, setHiding] = useState(false)
  const [favoriting, setFavoriting] = useState(false)
  const [unfavoriting, setUnfavoriting] = useState(false)

  const { preparing, zipStatus, startDownload } = useZipDownload({
    onComplete: onDownload,
  })

  // #region Actions
  const handleSelectAll = async () => {
    if (selectingAll) return
    setSelectingAll(true)
    try {
      await onSelectAll()
    } finally {
      setSelectingAll(false)
    }
  }

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

  const handleUnfavorite = async () => {
    if (selectedCount === 0 || unfavoriting) return
    setUnfavoriting(true)
    try {
      await unfavoriteMediaBatch([...selectedIds])
      toast.success(`${selectedCount} items unfavorited`)
      onUnfavorite?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unfavorite failed')
    } finally {
      setUnfavoriting(false)
    }
  }

  // Keyboard shortcuts
  const handleHideRef = useRef(handleHide)
  handleHideRef.current = handleHide
  const handleFavoriteRef = useRef(handleFavorite)
  handleFavoriteRef.current = handleFavorite
  const handleUnfavoriteRef = useRef(handleUnfavorite)
  handleUnfavoriteRef.current = handleUnfavorite
  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'h' || e.key === 'H') {
      e.preventDefault()
      handleHideRef.current()
    }
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault()
      if (viewModeRef.current === 'favorites') {
        handleUnfavoriteRef.current()
      } else {
        handleFavoriteRef.current()
      }
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
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/95 px-5 py-2.5 shadow-2xl backdrop-blur-sm">
        <span className="text-sm text-text">
          <span className="font-semibold text-text">{selectedCount}</span>{' '}
          selected
        </span>
        <div className="h-4 w-px bg-border" />
        <button
          className="text-sm text-accent hover:text-accent-hover disabled:opacity-50"
          onClick={handleSelectAll}
          disabled={selectingAll}
        >
          {selectingAll ? 'Selecting...' : 'Select all'}
        </button>
        {selectedCount > 0 && (
          <button
            className="text-sm text-accent hover:text-accent-hover"
            onClick={onDeselectAll}
          >
            Deselect
          </button>
        )}
        {viewMode === 'hidden' ? (
          <button
            className="rounded-lg bg-success px-4 py-1.5 text-sm font-semibold text-white hover:bg-success/80 disabled:opacity-50"
            onClick={handleUnhide}
            disabled={selectedCount === 0 || unhiding}
          >
            {unhiding ? 'Unhiding...' : 'Unhide'}
          </button>
        ) : (
          <>
            {viewMode === 'favorites' ? (
              <button
                className="rounded-lg bg-surface-strong px-4 py-1.5 text-sm font-semibold text-white hover:bg-surface-alt disabled:opacity-50"
                onClick={handleUnfavorite}
                disabled={selectedCount === 0 || unfavoriting}
              >
                {unfavoriting ? (
                  'Removing...'
                ) : (
                  <>
                    Unfavorite <span className="text-xs text-white/40">F</span>
                  </>
                )}
              </button>
            ) : (
              <button
                className="rounded-lg bg-danger/80 px-4 py-1.5 text-sm font-semibold text-white hover:bg-danger disabled:opacity-50"
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
            )}
            <button
              className="rounded-lg bg-surface-strong px-4 py-1.5 text-sm font-semibold text-white hover:bg-surface-strong disabled:opacity-50"
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
              className="relative overflow-hidden rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
              onClick={handleDownload}
              disabled={selectedCount === 0 || preparing}
            >
              {preparing ? (
                <>
                  <span className="relative z-10 flex items-center gap-2">
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
                      : `Downloading ${zipStatus?.files_ready ?? 0}/${zipStatus?.files_total ?? '?'}`}
                  </span>
                  <div
                    className="absolute inset-0 bg-white/15 transition-[width] duration-300 ease-out"
                    style={{
                      width:
                        zipStatus?.status === 'zipping'
                          ? '100%'
                          : `${((zipStatus?.files_ready ?? 0) / (zipStatus?.files_total || 1)) * 100}%`,
                    }}
                  />
                </>
              ) : (
                '↓ Download'
              )}
            </button>
          </>
        )}
        <button
          className="rounded p-1 text-text-soft hover:text-text"
          onClick={onCancel}
          aria-label="Exit select mode"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  )
}
