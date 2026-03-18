interface Props {
  scanning: boolean
  scanProgress: { scanned: number; total: number }
  onStartScan: () => void
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
      <span className="flex-1" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-soft">Similarity</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={similarityThreshold}
          onChange={(e) => onThresholdChange(Number(e.target.value))}
          className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-surface-alt accent-accent"
        />
        <span className="w-7 text-right text-xs tabular-nums text-text">
          {similarityThreshold.toFixed(2)}
        </span>
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
