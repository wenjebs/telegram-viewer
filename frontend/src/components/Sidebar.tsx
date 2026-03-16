import type { Group } from '#/api/types'

interface Props {
  groups: Group[]
  onToggleGroup: (group: Group) => void
  mediaTypeFilter: string | null
  onMediaTypeFilter: (type: string | null) => void
  onSync: () => void
  syncing: boolean
}

const TYPE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'Photos', value: 'photo' },
  { label: 'Videos', value: 'video' },
]

export default function Sidebar({
  groups,
  onToggleGroup,
  mediaTypeFilter,
  onMediaTypeFilter,
  onSync,
  syncing,
}: Props) {
  return (
    <aside className="flex h-screen w-70 min-w-70 flex-col border-r border-neutral-800 bg-neutral-900">
      <h2 className="border-b border-neutral-800 p-4 text-sm font-semibold">
        Groups
      </h2>
      <div className="flex-1 overflow-y-auto p-2">
        {groups.map((g) => (
          <label
            key={g.id}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-800"
          >
            <input
              type="checkbox"
              checked={g.active}
              onChange={() => onToggleGroup(g)}
              className="accent-sky-500"
            />
            <span>{g.name}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-1 border-t border-neutral-800 p-3">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            className={`flex-1 rounded px-2 py-1 text-xs ${mediaTypeFilter === opt.value ? 'bg-sky-600 text-white' : 'border border-neutral-700 text-neutral-300'}`}
            onClick={() => onMediaTypeFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button
        className="m-3 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        onClick={onSync}
        disabled={syncing}
      >
        {syncing ? 'Syncing...' : 'Sync Active Groups'}
      </button>
    </aside>
  )
}
