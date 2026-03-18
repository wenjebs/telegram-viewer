import { ArrowLeft, Download, Monitor, Moon, Sun, Upload } from 'lucide-react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useTheme } from '#/hooks/useTheme'
import { useSettingsBackup } from '#/hooks/useSettingsBackup'

const themeIcons = { system: Monitor, light: Sun, dark: Moon }
const themeLabels = { system: 'System', light: 'Light', dark: 'Dark' }

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { theme, cycle } = useTheme()
  const { exporting, importing, handleExport, handleImport } =
    useSettingsBackup()
  const ThemeIcon = themeIcons[theme]

  useHotkeys('Escape', onClose)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="rounded-md p-1.5 text-text-soft transition-colors hover:bg-hover hover:text-text"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h2 className="text-sm font-semibold text-text">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <section className="mb-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-soft">
            Appearance
          </h3>
          <button
            type="button"
            onClick={cycle}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text transition-colors hover:bg-hover"
          >
            <ThemeIcon className="size-4 text-text-soft" />
            Theme: {themeLabels[theme]}
          </button>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-soft">
            Backup
          </h3>
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text transition-colors hover:bg-hover disabled:opacity-50"
            >
              <Download className="size-4 text-text-soft" />
              Export settings
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text transition-colors hover:bg-hover disabled:opacity-50"
            >
              <Upload className="size-4 text-text-soft" />
              Import settings
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
