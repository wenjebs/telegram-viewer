import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { mergePersonsBatch } from '#/api/client'
import { useSelectMode } from './useSelectMode'

export function usePersonMerge(invalidatePersons: () => void) {
  const selectMode = useSelectMode()
  const [showKeeperPicker, setShowKeeperPicker] = useState(false)
  const [merging, setMerging] = useState(false)

  const openKeeperPicker = useCallback(() => {
    setShowKeeperPicker(true)
  }, [])

  const closeKeeperPicker = useCallback(() => {
    setShowKeeperPicker(false)
  }, [])

  const executeMerge = useCallback(
    async (keepId: number) => {
      const mergeIds = [...selectMode.selectedIds].filter((id) => id !== keepId)
      if (mergeIds.length === 0) return

      setMerging(true)
      try {
        await mergePersonsBatch(keepId, mergeIds)
        setShowKeeperPicker(false)
        selectMode.exitSelectMode()
        invalidatePersons()
        toast.success(
          `Merged ${mergeIds.length} ${mergeIds.length === 1 ? 'person' : 'people'}`,
        )
      } catch {
        toast.error('Failed to merge persons')
      } finally {
        setMerging(false)
      }
    },
    [selectMode, invalidatePersons],
  )

  return {
    selectMode,
    showKeeperPicker,
    merging,
    openKeeperPicker,
    closeKeeperPicker,
    executeMerge,
  }
}
