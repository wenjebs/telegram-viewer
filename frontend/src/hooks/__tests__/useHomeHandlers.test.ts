import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import { createWrapper } from '#/test/wrapper'
import {
  useHomeHandlers,
  type UseHomeHandlersParams,
} from '#/hooks/useHomeHandlers'
import type { Group } from '#/api/schemas'

vi.mock('#/api/client', () => ({
  clearAllMedia: vi.fn(async () => {}),
  hideDialog: vi.fn(async () => {}),
  unhideDialog: vi.fn(async () => {}),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { clearAllMedia, hideDialog, unhideDialog } from '#/api/client'
import { toast } from 'sonner'

function makeParams(
  overrides?: Partial<UseHomeHandlersParams>,
): UseHomeHandlersParams {
  return {
    invalidateCounts: vi.fn(),
    refetchGroups: vi.fn(),
    unsyncGroup: vi.fn(async () => {}),
    selectMode: { exitSelectMode: vi.fn() },
    personMerge: { selectMode: { exitSelectMode: vi.fn() } },
    lightbox: { setSelectedItem: vi.fn() },
    showHiddenDialogs: false,
    setShowHiddenDialogs: vi.fn(),
    setSearch: vi.fn(),
    ...overrides,
  }
}

const fakeGroup: Group = {
  id: 42,
  name: 'Test Group',
  type: 'group',
  unread_count: 0,
  active: true,
  last_synced: null,
  hidden_at: null,
}

describe('useHomeHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('handleClear', () => {
    it('calls clearAllMedia, invalidates queries, and resets URL params', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const params = makeParams()

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      await act(() => result.current.handleClear())

      expect(clearAllMedia).toHaveBeenCalled()
      expect(params.invalidateCounts).toHaveBeenCalled()
      expect(params.setSearch).toHaveBeenCalledWith({
        person: undefined,
        mode: undefined,
      })
      expect(toast.success).toHaveBeenCalledWith('All media cleared')
    })

    it('aborts when confirm is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      const params = makeParams()

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      await act(() => result.current.handleClear())

      expect(clearAllMedia).not.toHaveBeenCalled()
      expect(params.invalidateCounts).not.toHaveBeenCalled()
    })

    it('shows error toast on failure', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      vi.mocked(clearAllMedia).mockRejectedValueOnce(new Error('fail'))
      const params = makeParams()

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      await act(() => result.current.handleClear())

      expect(toast.error).toHaveBeenCalledWith('Failed to clear media')
    })
  })

  describe('handleHideDialog', () => {
    it('calls hideDialog, refetches groups, and invalidates', async () => {
      const params = makeParams()

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      await act(() => result.current.handleHideDialog(fakeGroup))

      expect(hideDialog).toHaveBeenCalledWith(42)
      expect(toast.success).toHaveBeenCalledWith('Test Group hidden')
      expect(params.refetchGroups).toHaveBeenCalled()
      expect(params.invalidateCounts).toHaveBeenCalled()
    })

    it('shows error toast on failure', async () => {
      vi.mocked(hideDialog).mockRejectedValueOnce(new Error('fail'))
      const params = makeParams()

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      await act(() => result.current.handleHideDialog(fakeGroup))

      expect(toast.error).toHaveBeenCalledWith('Failed to hide dialog')
      expect(params.refetchGroups).not.toHaveBeenCalled()
    })
  })

  describe('handleUnhideDialog', () => {
    it('calls unhideDialog and invalidates', async () => {
      const params = makeParams()

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      await act(() => result.current.handleUnhideDialog(fakeGroup))

      expect(unhideDialog).toHaveBeenCalledWith(42)
      expect(toast.success).toHaveBeenCalledWith('Test Group unhidden')
      expect(params.refetchGroups).toHaveBeenCalled()
      expect(params.invalidateCounts).toHaveBeenCalled()
    })

    it('shows error toast on failure', async () => {
      vi.mocked(unhideDialog).mockRejectedValueOnce(new Error('fail'))
      const params = makeParams()

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      await act(() => result.current.handleUnhideDialog(fakeGroup))

      expect(toast.error).toHaveBeenCalledWith('Failed to unhide dialog')
      expect(params.refetchGroups).not.toHaveBeenCalled()
    })
  })

  describe('handleUnsyncGroup', () => {
    it('calls unsyncGroup and shows success toast', async () => {
      const params = makeParams()

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      await act(() => result.current.handleUnsyncGroup(fakeGroup))

      expect(params.unsyncGroup).toHaveBeenCalledWith(42)
      expect(toast.success).toHaveBeenCalledWith('Test Group unsynced')
    })

    it('shows error toast on failure', async () => {
      const params = makeParams({
        unsyncGroup: vi.fn().mockRejectedValueOnce(new Error('fail')),
      })

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      await act(() => result.current.handleUnsyncGroup(fakeGroup))

      expect(toast.error).toHaveBeenCalledWith('Failed to unsync group')
      expect(toast.success).not.toHaveBeenCalled()
    })
  })

  describe('handleViewModeChange', () => {
    it('exits select modes, clears lightbox, and updates URL', () => {
      const params = makeParams()

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      act(() => result.current.handleViewModeChange('hidden'))

      expect(params.selectMode.exitSelectMode).toHaveBeenCalled()
      expect(params.personMerge.selectMode.exitSelectMode).toHaveBeenCalled()
      expect(params.lightbox.setSelectedItem).toHaveBeenCalledWith(null)
      expect(params.setSearch).toHaveBeenCalledWith({
        mode: 'hidden',
        person: undefined,
      })
    })

    it('sets mode to undefined for normal', () => {
      const params = makeParams()

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      act(() => result.current.handleViewModeChange('normal'))

      expect(params.setSearch).toHaveBeenCalledWith({
        mode: undefined,
        person: undefined,
      })
    })
  })

  describe('handleToggleHiddenDialogs', () => {
    it('toggles from false to true', () => {
      const params = makeParams({ showHiddenDialogs: false })

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      act(() => result.current.handleToggleHiddenDialogs())

      expect(params.setShowHiddenDialogs).toHaveBeenCalledWith(true)
    })

    it('toggles from true to false', () => {
      const params = makeParams({ showHiddenDialogs: true })

      const { result } = renderHook(() => useHomeHandlers(params), {
        wrapper: createWrapper(),
      })

      act(() => result.current.handleToggleHiddenDialogs())

      expect(params.setShowHiddenDialogs).toHaveBeenCalledWith(false)
    })
  })
})
