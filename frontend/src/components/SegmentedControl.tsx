type Option = {
  label: string
  value: string | null
}

type SegmentedControlProps = {
  options: Option[]
  value: string | null
  onChange: (value: string | null) => void
  label: string
}

export function SegmentedControl({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps) {
  return (
    <div
      className="flex gap-0.5 rounded-lg bg-surface-alt p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((opt) => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.label}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-surface-strong text-text shadow-sm'
                : 'text-text-soft hover:text-text'
            }`}
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
