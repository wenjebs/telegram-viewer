import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Person } from '#/api/schemas'
import { getFaceCropUrl } from '#/api/client'

interface Props {
  person: Person
  onBack: () => void
  onRename: (name: string) => void
  onMerge: () => void
}

export default function PersonDetail({
  person,
  onBack,
  onRename,
  onMerge,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(person.display_name)

  const save = () => {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== person.display_name) {
      onRename(trimmed)
    }
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-3 border-b border-border p-4">
      <button className="text-text-soft hover:text-text" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface-alt">
        {person.representative_face_id != null ? (
          <img
            src={getFaceCropUrl(
              person.representative_face_id,
              person.updated_at,
            )}
            alt={person.display_name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg text-text-soft">
            ?
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') {
                setNameInput(person.display_name)
                setEditing(false)
              }
            }}
            onBlur={save}
            className="rounded bg-surface-alt px-2 py-1 text-sm text-text outline-none ring-1 ring-border-soft focus:ring-ring"
          />
        ) : (
          <button
            className="text-sm font-medium text-text hover:text-sky-400"
            onClick={() => {
              setNameInput(person.display_name)
              setEditing(true)
            }}
          >
            {person.display_name}
          </button>
        )}
        <p className="text-xs text-text-soft">
          {person.face_count === 1 ? '1 photo' : `${person.face_count} photos`}
        </p>
      </div>

      <button
        className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
        onClick={onMerge}
      >
        Merge...
      </button>
    </div>
  )
}
