import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

interface Props {
  selectedCount: number
  merging: boolean
  deleting: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  onMerge: () => void
  onDelete: () => void
  onExitSelectMode: () => void
}

export default function PersonActionBar({
  selectedCount,
  merging,
  deleting,
  onSelectAll,
  onDeselectAll,
  onMerge,
  onDelete,
  onExitSelectMode,
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false)

  useHotkeys(
    'd',
    () => {
      if (selectedCount >= 1 && !deleting) setShowConfirm(true)
    },
    [selectedCount, deleting],
  )

  useHotkeys(
    'm',
    () => {
      if (selectedCount >= 2 && !merging) onMerge()
    },
    [selectedCount, merging, onMerge],
  )

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 border-t border-border bg-surface px-4 py-2">
        <span className="text-sm text-text">{selectedCount} selected</span>
        <div className="flex items-center gap-2">
          <button
            className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
            onClick={onSelectAll}
          >
            Select All
          </button>
          <button
            className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
            onClick={onDeselectAll}
          >
            Deselect
          </button>
          <button
            className="rounded bg-danger px-3 py-1 text-xs text-white hover:bg-danger/80 disabled:opacity-40"
            disabled={selectedCount < 1 || deleting}
            onClick={() => setShowConfirm(true)}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <button
            className="rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-40"
            disabled={selectedCount < 2 || merging}
            onClick={onMerge}
          >
            {merging ? 'Merging...' : 'Merge'}
          </button>
          <button
            className="rounded p-1 text-text-soft hover:bg-hover hover:text-text"
            onClick={onExitSelectMode}
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
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 max-w-sm rounded-xl bg-surface p-6">
            <p className="text-sm text-text">
              Delete {selectedCount} {selectedCount === 1 ? 'person' : 'people'}
              ? This removes all face data for{' '}
              {selectedCount === 1 ? 'this person' : 'these people'}. Photos
              will remain in your gallery.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg px-4 py-1.5 text-sm text-text-soft hover:bg-hover"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-danger px-4 py-1.5 text-sm font-semibold text-white hover:bg-danger/80"
                onClick={() => {
                  setShowConfirm(false)
                  onDelete()
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
