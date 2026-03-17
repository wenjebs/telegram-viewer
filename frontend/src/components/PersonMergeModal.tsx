import { useEffect, useRef } from 'react'
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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const others = persons.filter((p) => p.id !== currentPersonId)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="open:flex items-center justify-center backdrop:bg-black/60 bg-transparent p-0 m-0 max-w-none max-h-none w-screen h-screen"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close()
      }}
    >
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text">Merge with...</h2>
          <button className="text-text-soft hover:text-text" onClick={onClose}>
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
          <p className="py-4 text-center text-sm text-text-soft">
            No other people to merge with.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {others.map((person) => (
              <button
                key={person.id}
                className="flex items-center gap-3 rounded px-2 py-2 hover:bg-hover"
                onClick={() => onMerge(person.id)}
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-alt">
                  {person.representative_face_id != null ? (
                    <img
                      src={getFaceCropUrl(
                        person.representative_face_id,
                        person.updated_at,
                      )}
                      alt={person.display_name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-text-soft">
                      ?
                    </div>
                  )}
                </div>
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm text-text">
                    {person.display_name}
                  </p>
                  <p className="text-xs text-text-soft">
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
    </dialog>
  )
}
