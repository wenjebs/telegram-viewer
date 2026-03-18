import type { Person } from '#/api/schemas'

interface Props {
  selectedCount: number
  merging: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  onMerge: () => void
  onExitSelectMode: () => void
  persons: Person[]
}

export default function PersonMergeBar({
  selectedCount,
  merging,
  onSelectAll,
  onDeselectAll,
  onMerge,
  onExitSelectMode,
}: Props) {
  return (
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
  )
}
