import { useMemo, useRef, useState } from 'react'
import type { Person } from '#/api/schemas'
import { getFaceCropUrl } from '#/api/client'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Props {
  persons: Person[]
  loading: boolean
  onPersonClick: (person: Person) => void
  selectMode?: boolean
  selectedIds?: Set<number>
  onToggle?: (id: number) => void
  similarGroups?: number[][]
  onSelectGroup?: (ids: number[]) => void
  onRename?: (personId: number, name: string) => void
  containerRef?: React.RefObject<HTMLDivElement | null>
  dragHandlers?: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onPointerCancel: (e: React.PointerEvent) => void
  }
  selectionRect?: Rect | null
}

function PersonCard({
  person,
  selectMode,
  selectedIds,
  onToggle,
  onPersonClick,
  onRename,
}: {
  person: Person
  selectMode?: boolean
  selectedIds?: Set<number>
  onToggle?: (id: number) => void
  onPersonClick: (person: Person) => void
  onRename?: (personId: number, name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(person.display_name)
  const inputRef = useRef<HTMLInputElement>(null)

  const commitRename = () => {
    const trimmed = editName.trim()
    setEditing(false)
    if (trimmed && trimmed !== person.display_name && onRename) {
      onRename(person.id, trimmed)
    }
  }

  return (
    <div
      data-item-id={person.id}
      className={`flex flex-col items-center gap-1.5 rounded-lg p-2 cursor-pointer transition-colors hover:bg-hover/60${
        selectMode && selectedIds?.has(person.id)
          ? ' ring-2 ring-sky-500 bg-sky-500/5'
          : ''
      }`}
      onClick={(e) => {
        if (editing) return
        if (e.shiftKey && onRename) {
          e.preventDefault()
          setEditName(person.name ?? '')
          setEditing(true)
          requestAnimationFrame(() => inputRef.current?.focus())
          return
        }
        if (selectMode && onToggle) {
          onToggle(person.id)
        } else {
          onPersonClick(person)
        }
      }}
    >
      <div className="relative aspect-square w-full max-w-24">
        <div className="h-full w-full overflow-hidden rounded-full bg-surface-alt ring-1 ring-border">
          {person.representative_face_id != null ? (
            <img
              src={getFaceCropUrl(
                person.representative_face_id,
                person.updated_at,
              )}
              alt={person.display_name}
              className="h-full w-full object-cover"
              draggable={false}
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-text-soft">
              ?
            </div>
          )}
        </div>
        {selectMode && (
          <div
            className={`absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 shadow-sm ${
              selectedIds?.has(person.id)
                ? 'border-sky-500 bg-sky-500'
                : 'border-text-soft bg-surface/80'
            }`}
          >
            {selectedIds?.has(person.id) && (
              <svg
                className="h-3 w-3 text-white"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2 6l3 3 5-5" />
              </svg>
            )}
          </div>
        )}
      </div>
      {editing ? (
        <input
          ref={inputRef}
          className="w-full rounded bg-surface-alt px-1.5 py-0.5 text-center text-xs text-text outline-none focus:ring-1 focus:ring-ring"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={commitRename}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="w-full truncate text-center text-xs font-medium text-text">
          {person.display_name}
        </span>
      )}
      <span className="-mt-0.5 text-[11px] text-text-soft">
        {person.face_count === 1 ? '1 photo' : `${person.face_count} photos`}
      </span>
    </div>
  )
}

export default function PeopleGrid({
  persons,
  loading,
  onPersonClick,
  selectMode,
  selectedIds,
  onToggle,
  similarGroups = [],
  onSelectGroup,
  onRename,
  containerRef,
  dragHandlers,
  selectionRect,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const setScrollRef = (el: HTMLDivElement | null) => {
    scrollRef.current = el
    if (containerRef) {
      // biome-ignore: RefObject.current is writable at runtime
      ;(containerRef as { current: HTMLDivElement | null }).current = el
    }
  }

  // Build ordered sections: similar groups first, then ungrouped
  const sections = useMemo(() => {
    if (similarGroups.length === 0) {
      return [{ group: null as number[] | null, persons }]
    }

    const personMap = new Map(persons.map((p) => [p.id, p]))
    const grouped = new Set(similarGroups.flat())
    const result: { group: number[] | null; persons: Person[] }[] = []

    for (const group of similarGroups) {
      const groupPersons = group
        .map((id) => personMap.get(id))
        .filter((p): p is Person => p != null)
      if (groupPersons.length >= 2) {
        result.push({ group, persons: groupPersons })
      }
    }

    const ungrouped = persons.filter((p) => !grouped.has(p.id))
    if (ungrouped.length > 0) {
      result.push({ group: null, persons: ungrouped })
    }

    return result
  }, [persons, similarGroups])

  if (loading && persons.length === 0) {
    return <p className="p-8 text-center text-text-soft">Loading...</p>
  }

  if (persons.length === 0) {
    return (
      <p className="p-8 text-center text-text-soft">
        No people found. Run a face scan to detect faces in your photos.
      </p>
    )
  }

  const cardProps = {
    selectMode,
    selectedIds,
    onToggle,
    onPersonClick,
    onRename,
  }

  return (
    <div
      ref={setScrollRef}
      className={`relative overflow-y-auto p-4${selectMode ? ' select-none' : ''}`}
      {...dragHandlers}
    >
      {sections.map((section, si) => (
        <div key={si}>
          {section.group && (
            <div className="mb-2 mt-4 flex items-center gap-2 first:mt-0">
              <span className="text-xs text-text-soft">
                Similar ({section.persons.length})
              </span>
              <div className="h-px flex-1 bg-surface-alt" />
              {selectMode && onSelectGroup && (
                <button
                  className="text-xs text-sky-400 hover:text-sky-300"
                  onClick={() => onSelectGroup(section.group!)}
                >
                  Select group
                </button>
              )}
            </div>
          )}
          {!section.group && similarGroups.length > 0 && (
            <div className="mb-2 mt-4 flex items-center gap-2">
              <span className="text-xs text-text-soft">Others</span>
              <div className="h-px flex-1 bg-surface-alt" />
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
            {section.persons.map((person) => (
              <PersonCard key={person.id} person={person} {...cardProps} />
            ))}
          </div>
        </div>
      ))}
      {selectionRect && (
        <div
          className="pointer-events-none fixed z-50 border border-sky-500 bg-sky-500/10"
          style={{
            left: selectionRect.x,
            top: selectionRect.y,
            width: selectionRect.w,
            height: selectionRect.h,
          }}
        />
      )}
    </div>
  )
}
