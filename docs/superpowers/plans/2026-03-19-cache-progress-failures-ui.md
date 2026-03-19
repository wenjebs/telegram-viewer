# Cache Progress Failures UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show failed item counts, error states, and a retry-failed button in the cache progress UI (sidebar widget + settings panel).

**Architecture:** Frontend-only changes. The backend already tracks `failed_items`, `error`, and has an `error` status. We add: (1) failed count display when > 0, (2) error state rendering with error message, (3) a "Retry failed" action that re-starts the job (which resumes from cursor, re-attempting items that failed). No new backend endpoints needed — `/start` on an `error` state already resumes.

**Tech Stack:** React 19, TanStack Query, Tailwind CSS v4, Vitest

---

## File Structure

**Modify:**
- `frontend/src/components/CacheProgress.tsx` — Add error state, failed count, retry button
- `frontend/src/components/__tests__/CacheProgress.test.tsx` — Add tests for error/failed states
- `frontend/src/components/SettingsPanel.tsx` — Add failed count display, improve error state

---

## Task 1: CacheProgress Error + Failed States

**Files:**
- Modify: `frontend/src/components/__tests__/CacheProgress.test.tsx`
- Modify: `frontend/src/components/CacheProgress.tsx`

- [ ] **Step 1: Add failing tests for error state and failed count**

Append to `frontend/src/components/__tests__/CacheProgress.test.tsx`:

```tsx
  it('shows error state with message and retry button', () => {
    const startFn = vi.fn()
    mockUseCacheJob.mockReturnValue({
      status: {
        status: 'error',
        total_items: 100,
        cached_items: 80,
        skipped_items: 0,
        failed_items: 20,
        bytes_cached: 5000000,
        flood_wait_until: null,
        error: 'Connection lost',
      },
      start: startFn,
      pause: vi.fn(),
      cancel: vi.fn(),
      isRunning: false,
      isPaused: false,
      isCompleted: false,
    })
    renderWithWrapper(<CacheProgress />)
    expect(screen.getByText(/error/i)).toBeInTheDocument()
    expect(screen.getByText(/retry/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/retry/i))
    expect(startFn).toHaveBeenCalled()
  })

  it('shows failed count when items failed during running', () => {
    mockUseCacheJob.mockReturnValue({
      status: {
        status: 'running',
        total_items: 100,
        cached_items: 95,
        skipped_items: 0,
        failed_items: 5,
        bytes_cached: 5000000,
        flood_wait_until: null,
        error: null,
      },
      start: vi.fn(),
      pause: vi.fn(),
      cancel: vi.fn(),
      isRunning: true,
      isPaused: false,
      isCompleted: false,
    })
    renderWithWrapper(<CacheProgress />)
    expect(screen.getByText(/5 failed/i)).toBeInTheDocument()
  })

  it('shows completed state with failed count', () => {
    mockUseCacheJob.mockReturnValue({
      status: {
        status: 'completed',
        total_items: 100,
        cached_items: 95,
        skipped_items: 0,
        failed_items: 5,
        bytes_cached: 5000000,
        flood_wait_until: null,
        error: null,
      },
      start: vi.fn(),
      pause: vi.fn(),
      cancel: vi.fn(),
      isRunning: false,
      isPaused: false,
      isCompleted: true,
    })
    renderWithWrapper(<CacheProgress />)
    expect(screen.getByText(/5 failed/i)).toBeInTheDocument()
    expect(screen.getByText(/retry/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/CacheProgress.test.tsx`
Expected: 3 new tests FAIL (error state returns null, no "failed" text rendered)

- [ ] **Step 3: Update CacheProgress component**

Replace `frontend/src/components/CacheProgress.tsx` with:

```tsx
import { AlertTriangle, Download, Pause, Play, RotateCw } from 'lucide-react'
import { useCacheJob } from '#/hooks/useCacheJob'

export default function CacheProgress() {
  const { status, start, pause, isRunning, isPaused } = useCacheJob()

  if (!status) return null

  // Cancelled — hide
  if (status.status === 'cancelled') return null

  // Idle with no history — show start button
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
            {status.failed_items > 0 && (
              <> · {status.failed_items} failed</>
            )}
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
            {status.cached_items} / {status.total_items} cached
            · {status.failed_items} failed
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
        <div className="mb-1 text-danger/80">
          {status.failed_items} failed
        </div>
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/CacheProgress.test.tsx`
Expected: All 7 tests PASS

- [ ] **Step 5: Run `bun run check`**

Run: `cd frontend && bun run check`
Expected: 0 warnings, 0 errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CacheProgress.tsx frontend/src/components/__tests__/CacheProgress.test.tsx
git commit -m "feat: show failures, error state, and retry in CacheProgress"
```

---

## Task 2: SettingsPanel Failed Count + Error Display

**Files:**
- Modify: `frontend/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Read current SettingsPanel.tsx**

Read `frontend/src/components/SettingsPanel.tsx` to see the current Storage section.

- [ ] **Step 2: Update the Storage section stats display**

In the stats `<div>` (around line 100-112), add failed count display. Replace the existing stats block with:

```tsx
{cacheStatus && cacheStatus.status !== 'idle' && (
  <div className="mt-2 px-2 text-xs text-text-soft">
    {cacheStatus.cached_items} / {cacheStatus.total_items} items
    {cacheStatus.bytes_cached > 0 && (
      <>
        {' '}
        &middot;{' '}
        {(cacheStatus.bytes_cached / 1024 / 1024).toFixed(1)} MB
      </>
    )}
    {cacheStatus.failed_items > 0 && (
      <span className="text-danger/80">
        {' '}
        &middot; {cacheStatus.failed_items} failed
      </span>
    )}
  </div>
)}
{cacheStatus?.status === 'error' && cacheStatus.error && (
  <p className="mt-1 px-2 text-xs text-danger/80">
    {cacheStatus.error}
  </p>
)}
```

- [ ] **Step 3: Update the bottom buttons section**

Replace the existing cancel button block (around line 114-122) with retry + cancel for error state:

```tsx
{cacheStatus?.status === 'error' && (
  <button
    type="button"
    onClick={startCache}
    className="mt-1 px-2 text-xs text-accent transition-colors hover:text-accent/80"
  >
    Retry failed
  </button>
)}
{(isPaused || cacheStatus?.status === 'error') && (
  <button
    type="button"
    onClick={cancelCache}
    className="mt-1 px-2 text-xs text-danger transition-colors hover:text-danger/80"
  >
    Cancel
  </button>
)}
```

- [ ] **Step 4: Run `bun run check`**

Run: `cd frontend && bun run check`
Expected: 0 warnings, 0 errors

- [ ] **Step 5: Run full frontend test suite**

Run: `cd frontend && bun run vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SettingsPanel.tsx
git commit -m "feat: show failures and retry in SettingsPanel storage section"
```
