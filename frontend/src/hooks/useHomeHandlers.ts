import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { clearAllMedia, hideDialog, unhideDialog } from '#/api/client'
import type { Group } from '#/api/schemas'
import type { ViewMode } from '#/hooks/useHomeData'

export interface UseHomeHandlersParams {
  invalidateCounts: () => void
  refetchGroups: () => void
  unsyncGroup: (groupId: number) => Promise<void>
  selectMode: { exitSelectMode: () => void }
  personMerge: { selectMode: { exitSelectMode: () => void } }
  lightbox: { setSelectedItem: (item: null) => void }
  showHiddenDialogs: boolean
  setShowHiddenDialogs: (v: boolean) => void
  setSearch: (
    updates: Record<string, unknown>,
    opts?: { replace?: boolean },
  ) => void
}

export function useHomeHandlers(params: UseHomeHandlersParams) {
  const {
    invalidateCounts,
    refetchGroups,
    unsyncGroup,
    selectMode,
    personMerge,
    lightbox,
    showHiddenDialogs,
    setShowHiddenDialogs,
    setSearch,
  } = params

  const queryClient = useQueryClient()

  const handleClear = useCallback(async () => {
    if (
      !window.confirm(
        'This will clear everything — faces, downloaded photos, and cache. This is a full reset. Continue?',
      )
    )
      return
    try {
      await clearAllMedia()
      queryClient.invalidateQueries({ queryKey: ['media'] })
      queryClient.invalidateQueries({ queryKey: ['faces'] })
      invalidateCounts()
      setSearch({ person: undefined, mode: undefined })
      toast.success('All media cleared')
    } catch {
      toast.error('Failed to clear media')
    }
  }, [queryClient, invalidateCounts, setSearch])

  const handleHideDialog = useCallback(
    async (group: Group) => {
      try {
        await hideDialog(group.id)
      } catch {
        toast.error('Failed to hide dialog')
        return
      }
      toast.success(`${group.name} hidden`)
      refetchGroups()
      queryClient.invalidateQueries({ queryKey: ['media'] })
      invalidateCounts()
    },
    [queryClient, refetchGroups, invalidateCounts],
  )

  const handleUnhideDialog = useCallback(
    async (group: Group) => {
      try {
        await unhideDialog(group.id)
      } catch {
        toast.error('Failed to unhide dialog')
        return
      }
      toast.success(`${group.name} unhidden`)
      queryClient.invalidateQueries({ queryKey: ['hiddenDialogs'] })
      refetchGroups()
      queryClient.invalidateQueries({ queryKey: ['media'] })
      invalidateCounts()
    },
    [queryClient, refetchGroups, invalidateCounts],
  )

  const handleUnsyncGroup = useCallback(
    async (group: Group) => {
      try {
        await unsyncGroup(group.id)
      } catch {
        toast.error('Failed to unsync group')
        return
      }
      toast.success(`${group.name} unsynced`)
    },
    [unsyncGroup],
  )

  const handleToggleHiddenDialogs = useCallback(() => {
    const next = !showHiddenDialogs
    setShowHiddenDialogs(next)
  }, [showHiddenDialogs, setShowHiddenDialogs])

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      selectMode.exitSelectMode()
      personMerge.selectMode.exitSelectMode()
      lightbox.setSelectedItem(null)
      setSearch({
        mode: mode === 'normal' ? undefined : mode,
        person: undefined,
      })
    },
    [selectMode, personMerge, lightbox, setSearch],
  )

  return {
    handleClear,
    handleHideDialog,
    handleUnhideDialog,
    handleUnsyncGroup,
    handleToggleHiddenDialogs,
    handleViewModeChange,
  }
}
