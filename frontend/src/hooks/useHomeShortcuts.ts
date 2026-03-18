import { useHotkeys } from 'react-hotkeys-hook'
import type { Group } from '#/api/schemas'
import type { ViewMode } from '#/hooks/useHomeData'
import { useAppStore } from '#/stores/appStore'

interface UseHomeShortcutsParams {
  selectMode: {
    active: boolean
    exitSelectMode: () => void
  }
  personMerge: {
    selectMode: {
      active: boolean
      exitSelectMode: () => void
    }
  }
  lightbox: {
    selectedItem: unknown | null
    justClosedLightboxRef: { current: boolean }
  }
  lightboxItem: unknown | null
  handleViewModeChange: (mode: ViewMode) => void
  handleToggleHiddenDialogs: () => void
  handleHideDialog: (group: Group) => Promise<void>
  groups: Group[]
  viewMode: ViewMode
}

export function useHomeShortcuts(params: UseHomeShortcutsParams) {
  const {
    selectMode,
    personMerge,
    lightbox,
    lightboxItem,
    handleViewModeChange,
    handleToggleHiddenDialogs,
    handleHideDialog,
    groups,
    viewMode,
  } = params

  const setShowShortcuts = useAppStore((s) => s.setShowShortcuts)

  // Escape key
  useHotkeys(
    'escape',
    () => {
      if (
        personMerge.selectMode.active &&
        !lightbox.selectedItem &&
        !lightbox.justClosedLightboxRef.current
      ) {
        personMerge.selectMode.exitSelectMode()
        return
      }
      if (
        selectMode.active &&
        !lightbox.selectedItem &&
        !lightbox.justClosedLightboxRef.current
      ) {
        selectMode.exitSelectMode()
      }
    },
    [selectMode.active, personMerge.selectMode.active, lightbox.selectedItem],
  )

  useHotkeys('shift+slash', () => setShowShortcuts(true))

  // Navigation shortcuts (only when lightbox is closed)
  useHotkeys('p', () => !lightboxItem && handleViewModeChange('people'), [
    lightboxItem,
  ])
  useHotkeys('g', () => !lightboxItem && handleViewModeChange('normal'), [
    lightboxItem,
  ])
  useHotkeys('f', () => !lightboxItem && handleViewModeChange('favorites'), [
    lightboxItem,
  ])
  useHotkeys(
    'h',
    () => {
      if (lightboxItem || selectMode.active) return
      handleViewModeChange(viewMode === 'hidden' ? 'normal' : 'hidden')
    },
    [lightboxItem, selectMode.active, viewMode],
  )
  useHotkeys('shift+h', () => !lightboxItem && handleToggleHiddenDialogs(), [
    lightboxItem,
    handleToggleHiddenDialogs,
  ])
  useHotkeys(
    'shift+d',
    async () => {
      if (lightboxItem || selectMode.active) return
      const activeGroups = groups.filter((g) => g.active)
      for (const g of activeGroups) {
        await handleHideDialog(g)
      }
    },
    [lightboxItem, selectMode.active, groups],
  )
}
