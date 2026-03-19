import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { createWrapper } from '#/test/wrapper'
import CacheProgress from '#/components/CacheProgress'

// Mock the hook
vi.mock('#/hooks/useCacheJob', () => ({
  useCacheJob: vi.fn(),
}))

import { useCacheJob } from '#/hooks/useCacheJob'

const mockUseCacheJob = vi.mocked(useCacheJob)

function renderWithWrapper(ui: React.ReactElement) {
  return render(ui, { wrapper: createWrapper() })
}

describe('CacheProgress', () => {
  it('shows start button when idle', () => {
    mockUseCacheJob.mockReturnValue({
      status: {
        status: 'idle',
        total_items: 0,
        cached_items: 0,
        skipped_items: 0,
        failed_items: 0,
        bytes_cached: 0,
        flood_wait_until: null,
        error: null,
      },
      start: vi.fn(),
      pause: vi.fn(),
      cancel: vi.fn(),
      isRunning: false,
      isPaused: false,
      isCompleted: false,
    })
    renderWithWrapper(<CacheProgress />)
    expect(screen.getByText(/cache all media/i)).toBeInTheDocument()
  })

  it('shows progress when running', () => {
    mockUseCacheJob.mockReturnValue({
      status: {
        status: 'running',
        total_items: 100,
        cached_items: 42,
        skipped_items: 0,
        failed_items: 0,
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
    expect(screen.getByText(/42/)).toBeInTheDocument()
    expect(screen.getByText(/100/)).toBeInTheDocument()
  })

  it('shows resume button when paused', () => {
    mockUseCacheJob.mockReturnValue({
      status: {
        status: 'paused',
        total_items: 100,
        cached_items: 50,
        skipped_items: 0,
        failed_items: 0,
        bytes_cached: 5000000,
        flood_wait_until: null,
        error: null,
      },
      start: vi.fn(),
      pause: vi.fn(),
      cancel: vi.fn(),
      isRunning: false,
      isPaused: true,
      isCompleted: false,
    })
    renderWithWrapper(<CacheProgress />)
    expect(screen.getByText(/paused/i)).toBeInTheDocument()
  })

  it('calls start when start button clicked', () => {
    const startFn = vi.fn()
    mockUseCacheJob.mockReturnValue({
      status: {
        status: 'idle',
        total_items: 0,
        cached_items: 0,
        skipped_items: 0,
        failed_items: 0,
        bytes_cached: 0,
        flood_wait_until: null,
        error: null,
      },
      start: startFn,
      pause: vi.fn(),
      cancel: vi.fn(),
      isRunning: false,
      isPaused: false,
      isCompleted: false,
    })
    renderWithWrapper(<CacheProgress />)
    fireEvent.click(screen.getByText(/cache all media/i))
    expect(startFn).toHaveBeenCalled()
  })

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

  it('shows completed state with failed count and retry', () => {
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
})
