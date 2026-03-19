import { Download, Pause, Play } from 'lucide-react'
import { useCacheJob } from '#/hooks/useCacheJob'

export default function CacheProgress() {
  const { status, start, pause, isRunning, isPaused } = useCacheJob()

  if (!status) return null

  // Completed or cancelled — don't show anything
  if (status.status === 'completed' || status.status === 'cancelled') {
    return null
  }

  // Idle — show start button
  if (status.status === 'idle') {
    return (
      <button
        type="button"
        onClick={start}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-text-soft transition-colors hover:bg-hover"
      >
        <Download className="size-3.5" />
        Cache all media
      </button>
    )
  }

  // Running or paused — show progress
  const progress =
    status.total_items > 0
      ? (status.cached_items / status.total_items) * 100
      : 0

  return (
    <div className="rounded-md bg-surface-strong p-2 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-text-soft">
          {isPaused
            ? 'Paused'
            : status.flood_wait_until
              ? 'Rate limited'
              : 'Caching...'}
        </span>
        <div className="flex items-center gap-1">
          <span className="font-medium text-accent tabular-nums">
            {status.cached_items} / {status.total_items}
          </span>
          {isRunning ? (
            <button
              type="button"
              onClick={pause}
              className="rounded p-0.5 text-text-soft transition-colors hover:bg-hover hover:text-text"
            >
              <Pause className="size-3" />
            </button>
          ) : isPaused ? (
            <button
              type="button"
              onClick={start}
              className="rounded p-0.5 text-text-soft transition-colors hover:bg-hover hover:text-text"
            >
              <Play className="size-3" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-sm bg-surface">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
