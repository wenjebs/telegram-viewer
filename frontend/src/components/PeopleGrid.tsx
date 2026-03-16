import type { Person } from '#/api/schemas'
import { getFaceCropUrl } from '#/api/client'

interface Props {
  persons: Person[]
  loading: boolean
  onPersonClick: (person: Person) => void
}

export default function PeopleGrid({ persons, loading, onPersonClick }: Props) {
  if (loading && persons.length === 0) {
    return <p className="p-8 text-center text-neutral-500">Loading...</p>
  }

  if (persons.length === 0) {
    return (
      <p className="p-8 text-center text-neutral-500">
        No people found. Run a face scan to detect faces in your photos.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4 p-4">
      {persons.map((person) => (
        <button
          key={person.id}
          className="flex flex-col items-center gap-1 rounded p-2 hover:bg-neutral-800"
          onClick={() => onPersonClick(person)}
        >
          <div className="h-20 w-20 overflow-hidden rounded-full bg-neutral-800">
            {person.representative_face_id != null ? (
              <img
                src={getFaceCropUrl(person.representative_face_id)}
                alt={person.display_name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl text-neutral-500">
                ?
              </div>
            )}
          </div>
          <span className="w-full truncate text-xs text-neutral-300">
            {person.display_name}
          </span>
          <span className="text-xs text-neutral-500">
            {person.face_count === 1
              ? '1 photo'
              : `${person.face_count} photos`}
          </span>
        </button>
      ))}
    </div>
  )
}
