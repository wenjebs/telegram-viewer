import type { Person } from '#/api/schemas'
import { getFaceCropUrl } from '#/api/client'

interface Props {
  persons: Person[]
  currentPersonId: number
  onMerge: (mergeId: number) => void
  onClose: () => void
}

export default function PersonMergeModal({
  persons,
  currentPersonId,
  onMerge,
  onClose,
}: Props) {
  const others = persons.filter((p) => p.id !== currentPersonId)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-neutral-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-white">Merge with...</h2>
          <button
            className="text-neutral-400 hover:text-white"
            onClick={onClose}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M6 6l8 8M14 6l-8 8" />
            </svg>
          </button>
        </div>

        {others.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-500">
            No other people to merge with.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {others.map((person) => (
              <button
                key={person.id}
                className="flex items-center gap-3 rounded px-2 py-2 hover:bg-neutral-800"
                onClick={() => onMerge(person.id)}
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-800">
                  {person.representative_face_id != null ? (
                    <img
                      src={getFaceCropUrl(person.representative_face_id)}
                      alt={person.display_name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
                      ?
                    </div>
                  )}
                </div>
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm text-neutral-300">
                    {person.display_name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {person.face_count === 1
                      ? '1 photo'
                      : `${person.face_count} photos`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
