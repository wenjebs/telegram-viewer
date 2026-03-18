import type { Person } from '#/api/schemas'

interface Props {
  person: Person
  onBack: () => void
}

export default function PersonBreadcrumb({ person, onBack }: Props) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
      <svg
        className="h-4 w-4 text-text-soft"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="5" r="3" />
        <path d="M2 15c0-3 2.7-5 6-5s6 2 6 5" />
      </svg>
      <span className="flex-1 text-sm font-medium text-text">
        {person.name}
      </span>
      <button
        className="rounded p-1 text-text-soft hover:bg-hover hover:text-text"
        onClick={onBack}
        aria-label="Back to people"
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
