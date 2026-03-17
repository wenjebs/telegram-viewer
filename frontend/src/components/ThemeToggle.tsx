import { useTheme } from '#/hooks/useTheme'

const SunIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
    <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zm0 13a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zm8-5a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zm11.95-4.95a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 01-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zm-12.73 8.84a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 01-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zm12.73 0a.75.75 0 01-1.06 1.06l-1.06-1.06a.75.75 0 011.06-1.06l1.06 1.06zm-12.73-8.84a.75.75 0 01-1.06 0L4.1 4.1a.75.75 0 011.06-1.06l1.06 1.06a.75.75 0 010 1.06zM10 7a3 3 0 100 6 3 3 0 000-6z" />
  </svg>
)

const MoonIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
    <path
      fillRule="evenodd"
      d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.23 1.694a.75.75 0 01.226.31z"
      clipRule="evenodd"
    />
  </svg>
)

const MonitorIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
    <path
      fillRule="evenodd"
      d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v8.5A2.25 2.25 0 0115.75 15h-3.105a3.501 3.501 0 001.1 1.677A.75.75 0 0113.26 18H6.74a.75.75 0 01-.484-1.323A3.501 3.501 0 007.355 15H4.25A2.25 2.25 0 012 12.75v-8.5zm1.5 0a.75.75 0 01.75-.75h11.5a.75.75 0 01.75.75v7.5H3.5v-7.5z"
      clipRule="evenodd"
    />
  </svg>
)

const icons = { system: MonitorIcon, light: SunIcon, dark: MoonIcon }
const labels = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
}

export function ThemeToggle() {
  const { theme, cycle } = useTheme()
  const Icon = icons[theme]

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={labels[theme]}
      className="rounded-md p-1.5 text-text-soft transition-colors hover:bg-hover hover:text-text"
    >
      <Icon />
    </button>
  )
}
