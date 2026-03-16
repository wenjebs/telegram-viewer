import { useState } from 'react'
import { downloadZip, unhideMediaBatch } from '#/api/client'

interface Props {
  selectedCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onDownload: () => void
  onCancel: () => void
  selectedIds: Set<number>
  viewMode?: 'normal' | 'hidden' | 'favorites'
  onUnhide?: () => void
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
}: Props) {
  const [downloading, setDownloading] = useState(false)
  const [unhiding, setUnhiding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // #region Actions
  const handleDownload = async () => {
    if (selectedCount === 0 || downloading) return
    setDownloading(true)
    setError(null)
    try {
      const blob = await downloadZip([...selectedIds])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'telegram_media.zip'
      a.click()
      URL.revokeObjectURL(url)
      onDownload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const handleUnhide = async () => {
    if (selectedCount === 0 || unhiding) return
    setUnhiding(true)
    setError(null)
    try {
      await unhideMediaBatch([...selectedIds])
      onUnhide?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unhide failed')
    } finally {
      setUnhiding(false)
    }
  }
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
          <button
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            onClick={handleDownload}
            disabled={selectedCount === 0 || downloading}
          >
            {downloading ? (
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
                Preparing...
              </span>
            ) : (
              '↓ Download'
            )}
          </button>
        )}
        <button
          className="text-sm text-neutral-400 hover:text-neutral-200"
          onClick={onCancel}
        >
          ✕
        </button>
      </div>
      {error && (
        <div className="mt-2 text-center text-xs text-red-400">{error}</div>
      )}
    </div>
  )
}
