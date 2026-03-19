import type { ConflictsResponse } from '#/api/schemas'

interface Props {
  conflicts: ConflictsResponse['conflicts']
  onConfirm: () => void
  onCancel: () => void
}

export default function CrossPersonWarningModal({
  conflicts,
  onConfirm,
  onCancel,
}: Props) {
  // Aggregate: count photos per person across all conflicts
  const personCounts = new Map<number, { name: string; count: number }>()
  for (const c of conflicts) {
    for (const p of c.persons) {
      const existing = personCounts.get(p.id)
      if (existing) {
        existing.count++
      } else {
        personCounts.set(p.id, { name: p.display_name, count: 1 })
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <p className="text-sm font-medium text-text">
          These photos also appear in other people's views:
        </p>
        <ul className="mt-3 space-y-1">
          {[...personCounts.values()].map((p) => (
            <li key={p.name} className="text-sm text-text-soft">
              {p.name}{' '}
              <span className="text-text-softer">
                ({p.count} {p.count === 1 ? 'photo' : 'photos'})
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-text-softer">
          Hiding will remove them from those views too.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-lg px-4 py-1.5 text-sm text-text-soft hover:bg-hover"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-danger px-4 py-1.5 text-sm font-semibold text-white hover:bg-danger/80"
            onClick={onConfirm}
          >
            Hide anyway
          </button>
        </div>
      </div>
    </div>
  )
}
