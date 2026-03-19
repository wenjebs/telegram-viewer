import type { ViewMode } from '#/hooks/useHomeData'

interface Props {
  viewMode: ViewMode
  onClose: () => void
  onDeleteAll?: () => void
  hiddenCount?: number
}

export default function ViewModeHeader({
  viewMode,
  onClose,
  onDeleteAll,
  hiddenCount,
}: Props) {
  if (viewMode === 'normal' || viewMode === 'people') return null

  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
      {viewMode === 'hidden' && (
        <svg
          className="h-4 w-4 text-text-soft"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
          <circle cx="8" cy="8" r="2" />
          <line x1="2" y1="14" x2="14" y2="2" />
        </svg>
      )}
      {viewMode === 'favorites' && (
        <span className="text-sm text-text-soft">&#9829;</span>
      )}
      <span className="flex-1 text-sm font-medium text-text">
        {viewMode === 'hidden' && 'Hidden Media'}
        {viewMode === 'favorites' && 'Favorites'}
      </span>
      {viewMode === 'hidden' && onDeleteAll && (
        <button
          className="rounded px-2 py-1 text-xs text-danger hover:bg-hover disabled:opacity-50 disabled:hover:bg-transparent"
          onClick={onDeleteAll}
          disabled={hiddenCount === 0}
        >
          Delete All
        </button>
      )}
      <button
        className="rounded p-1 text-text-soft hover:bg-hover hover:text-text"
        onClick={onClose}
        aria-label="Back to gallery"
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
  )
}
