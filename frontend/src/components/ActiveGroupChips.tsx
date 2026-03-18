import type { Group } from '#/api/schemas'

interface Props {
  groups: Group[]
  onToggle: (group: Group) => void
  onDeselectAll: () => void
}

export default function ActiveGroupChips({
  groups,
  onToggle,
  onDeselectAll,
}: Props) {
  const activeGroups = groups.filter((g) => g.active)
  if (activeGroups.length === 0) return null

  return (
    <div className="flex items-center justify-center gap-2 border-b border-border bg-surface/80 px-4 py-2 backdrop-blur-sm">
      <span className="shrink-0 text-xs text-text-soft">Syncing:</span>
      <div className="flex flex-wrap justify-center gap-1">
        {activeGroups.map((g) => (
          <button
            key={g.id}
            className="flex items-center gap-1 rounded-full bg-chip px-2 py-0.5 text-xs text-text-soft ring-1 ring-chip-border hover:bg-surface-strong"
            onClick={() => onToggle(g)}
            title="Click to deactivate"
          >
            <span className="max-w-28 truncate">{g.name}</span>
            <span className="text-text-soft/60 hover:text-text">✕</span>
          </button>
        ))}
      </div>
      {activeGroups.length > 1 && (
        <button
          className="shrink-0 text-xs text-text-soft hover:text-text"
          onClick={onDeselectAll}
        >
          Clear all
        </button>
      )}
    </div>
  )
}
