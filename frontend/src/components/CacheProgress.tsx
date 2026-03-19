import { AlertTriangle, Pause, Play, RotateCw } from 'lucide-react'
import { useCacheJob } from '#/hooks/useCacheJob'

export default function CacheProgress() {
  const { status, start, pause, isRunning, isPaused } = useCacheJob()

  if (!status) return null

  // Cancelled or idle — nothing to show in sidebar (start from Settings)
  if (status.status === 'cancelled' || status.status === 'idle') return null

  // Error state — show error message + retry
  if (status.status === 'error') {
    return (
      <div className="rounded-md bg-surface-strong p-2 text-xs">
        <div className="mb-1 flex items-center gap-1.5 text-danger">
          <AlertTriangle className="size-3" />
          <span>Cache error</span>
        </div>
        {status.error && (
          <p className="mb-1.5 text-text-soft">{status.error}</p>
        )}
        <div className="flex items-center justify-between text-text-soft">
          <span className="tabular-nums">
            {status.cached_items} / {status.total_items}
            {status.failed_items > 0 && <> · {status.failed_items} failed</>}
          </span>
          <button
            type="button"
            onClick={start}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-accent transition-colors hover:bg-hover"
          >
            <RotateCw className="size-3" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Completed with failures — show summary + retry
  if (status.status === 'completed' && status.failed_items > 0) {
    return (
      <div className="rounded-md bg-surface-strong p-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-text-soft tabular-nums">
            {status.cached_items} / {status.total_items} cached ·{' '}
            {status.failed_items} failed
          </span>
          <button
            type="button"
            onClick={start}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-accent transition-colors hover:bg-hover"
          >
            <RotateCw className="size-3" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Completed with no failures — hide
  if (status.status === 'completed') return null

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
      {status.failed_items > 0 && (
        <div className="mb-1 text-danger/80">{status.failed_items} failed</div>
      )}
      <div className="h-1 w-full overflow-hidden rounded-sm bg-surface">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
