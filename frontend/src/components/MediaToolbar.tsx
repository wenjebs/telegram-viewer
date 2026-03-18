import { ArrowDownWideNarrow } from 'lucide-react'

interface Props {
  itemCount: number
  totalCount: number
  hiddenCount: number
  favoritesCount: number
  viewMode: string
  selectModeActive: boolean
  onEnterSelectMode: () => void
  sortOrder: string
  onToggleSort: () => void
}

export default function MediaToolbar({
  itemCount,
  totalCount,
  hiddenCount,
  favoritesCount,
  viewMode,
  selectModeActive,
  onEnterSelectMode,
  sortOrder,
  onToggleSort,
}: Props) {
  return (
    <div className="flex items-center justify-end gap-1 px-4 py-1.5">
      <span className="mr-auto text-xs tabular-nums text-text-soft">
        {itemCount.toLocaleString()}
        {viewMode === 'normal' && totalCount > 0 && (
          <> / {totalCount.toLocaleString()}</>
        )}
        {viewMode === 'hidden' && hiddenCount > 0 && (
          <> / {hiddenCount.toLocaleString()}</>
        )}
        {viewMode === 'favorites' && favoritesCount > 0 && (
          <> / {favoritesCount.toLocaleString()}</>
        )}
      </span>
      <button
        className={`rounded-lg p-1.5 ${
          selectModeActive
            ? 'bg-accent/20 text-accent'
            : 'text-text-soft hover:bg-hover hover:text-text'
        }`}
        onClick={onEnterSelectMode}
        disabled={selectModeActive}
        title="Select mode"
        aria-label="Select mode"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="1" y="1" width="6" height="6" rx="1" />
          <rect x="9" y="1" width="6" height="6" rx="1" />
          <rect x="1" y="9" width="6" height="6" rx="1" />
          <path d="M11 10l1.5 1.5L15 9" />
        </svg>
      </button>
      <button
        className="rounded-lg p-1.5 text-text-soft hover:bg-hover hover:text-text"
        aria-label={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
        title={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
        onClick={onToggleSort}
      >
        <ArrowDownWideNarrow
          size={20}
          className={`transition-transform duration-300 ease-out ${sortOrder === 'asc' ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  )
}
