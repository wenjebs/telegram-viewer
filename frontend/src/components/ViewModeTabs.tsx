type ViewMode = 'normal' | 'hidden' | 'favorites' | 'people'

interface Props {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  hiddenCount?: number
  favoritesCount?: number
  personCount?: number
}

const TABS: { mode: ViewMode; label: string; countKey?: keyof Props }[] = [
  { mode: 'normal', label: 'Gallery' },
  { mode: 'hidden', label: 'Hidden', countKey: 'hiddenCount' },
  { mode: 'favorites', label: 'Favorites', countKey: 'favoritesCount' },
  { mode: 'people', label: 'People', countKey: 'personCount' },
]

export default function ViewModeTabs({
  viewMode,
  onViewModeChange,
  hiddenCount = 0,
  favoritesCount = 0,
  personCount = 0,
}: Props) {
  const counts: Record<string, number> = {
    hiddenCount,
    favoritesCount,
    personCount,
  }

  const activeIndex = TABS.findIndex((t) => t.mode === viewMode)

  return (
    <div
      className="relative flex border-b border-border bg-surface"
      role="tablist"
      aria-label="View mode"
    >
      <span
        className="absolute bottom-0 h-0.5 bg-accent transition-[left] duration-250 ease-out"
        style={{
          width: `${100 / TABS.length}%`,
          left: `${(activeIndex * 100) / TABS.length}%`,
        }}
      />
      {TABS.map(({ mode, label, countKey }) => {
        const active = viewMode === mode
        const count = countKey ? counts[countKey] : 0
        return (
          <button
            key={mode}
            role="tab"
            aria-selected={active}
            className={`flex flex-1 items-center justify-center gap-1.5 px-4 py-2 text-sm transition-colors ${
              active
                ? 'font-medium text-text'
                : 'text-text-soft hover:bg-hover hover:text-text'
            }`}
            onClick={() =>
              onViewModeChange(active && mode !== 'normal' ? 'normal' : mode)
            }
          >
            {label}
            {count > 0 && (
              <span className="rounded-full bg-surface-strong px-1.5 py-0.5 text-[10px] leading-none text-text-soft">
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
