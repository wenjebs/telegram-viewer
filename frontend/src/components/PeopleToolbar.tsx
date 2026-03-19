interface Props {
  scanning: boolean
  scanProgress: { scanned: number; total: number }
  onStartScan: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  similarityThreshold: number
  onThresholdChange: (value: number) => void
  mergeSelectActive: boolean
  onEnterMergeSelect: () => void
  onDeselectAll: () => void
  onClose: () => void
}

export default function PeopleToolbar({
  scanning,
  scanProgress,
  onStartScan,
  searchQuery,
  onSearchChange,
  similarityThreshold,
  onThresholdChange,
  mergeSelectActive,
  onEnterMergeSelect,
  onDeselectAll,
  onClose,
}: Props) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
      <button
        className="flex items-center justify-center gap-2 rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-hover disabled:opacity-50"
        onClick={onStartScan}
        disabled={scanning}
      >
        {scanning
          ? `Scanning... ${scanProgress.scanned}/${scanProgress.total}`
          : 'Scan Faces'}
      </button>
      <input
        type="text"
        placeholder="Search people..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="rounded bg-surface-alt px-2.5 py-1 text-sm text-text placeholder:text-text-soft outline-none focus:ring-1 focus:ring-ring w-44"
      />
      <span className="flex-1" />
      <div className="flex items-center gap-2">
        <span
          className="text-xs text-text-soft"
          title="How closely faces must match to be grouped as the same person. Higher = stricter."
        >
          Similarity
        </span>
        <kbd className="rounded bg-surface-alt px-1 text-[10px] text-text-soft/50">
          S+↑↓
        </kbd>
        <span className="text-[10px] text-text-soft/40">lenient</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={similarityThreshold}
          onChange={(e) => onThresholdChange(Number(e.target.value))}
          className="h-2 w-36 cursor-pointer appearance-none rounded-full bg-surface-alt accent-accent"
        />
        <span className="text-[10px] text-text-soft/40">strict</span>
        <input
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={similarityThreshold}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (v >= 0 && v <= 1) onThresholdChange(v)
          }}
          className="w-10 appearance-none rounded bg-surface-alt px-1.5 py-0.5 text-right text-xs tabular-nums text-text outline-none focus:ring-1 focus:ring-ring [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      {mergeSelectActive ? (
        <button
          className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
          onClick={onDeselectAll}
        >
          Deselect All
        </button>
      ) : (
        <button
          className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
          onClick={onEnterMergeSelect}
        >
          Select
        </button>
      )}
      <button
        className="rounded p-1 text-text-soft hover:bg-hover hover:text-text"
        onClick={onClose}
        title={mergeSelectActive ? 'Exit select mode' : 'Back to gallery'}
        aria-label={mergeSelectActive ? 'Exit select mode' : 'Back to gallery'}
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
