import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { hideMedia, unhideMedia, toggleFavorite } from '#/api/client'
import type { MediaItem } from '#/api/schemas'

interface LightboxOptions {
  activeItems: MediaItem[]
  selectedItem: MediaItem | null
  setSelectedItem: (item: MediaItem | null) => void
  media: { removeItem: (id: number) => void }
  hidden: { removeItems: (ids: number[]) => void }
  selectMode: {
    active: boolean
    isSelected: (id: number) => boolean
    enterSelectMode: (id?: number) => void
    toggle: (id: number) => void
  }
  refreshCounts: () => void
  invalidateMedia: () => void
  viewMode: string
}

export function useLightbox({
  activeItems,
  selectedItem,
  setSelectedItem,
  media,
  hidden,
  selectMode,
  refreshCounts,
  invalidateMedia,
  viewMode,
}: LightboxOptions) {
  const justClosedLightboxRef = useRef(false)

  const selectedIndex = selectedItem
    ? activeItems.findIndex((i) => i.id === selectedItem.id)
    : -1

  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) setSelectedItem(activeItems[selectedIndex - 1])
  }, [selectedIndex, activeItems, setSelectedItem])

  const handleNext = useCallback(() => {
    if (selectedIndex < activeItems.length - 1)
      setSelectedItem(activeItems[selectedIndex + 1])
  }, [selectedIndex, activeItems, setSelectedItem])

  const handleClose = useCallback(() => {
    setSelectedItem(null)
    justClosedLightboxRef.current = true
    requestAnimationFrame(() => {
      justClosedLightboxRef.current = false
    })
  }, [setSelectedItem])

  const handleToggleSelect = useCallback(() => {
    if (!selectedItem) return
    if (!selectMode.active) {
      selectMode.enterSelectMode(selectedItem.id)
    } else {
      selectMode.toggle(selectedItem.id)
    }
  }, [selectedItem, selectMode])

  const handleHide = useCallback(async () => {
    if (!selectedItem) return
    const currentIndex = activeItems.findIndex((i) => i.id === selectedItem.id)

    try {
      await hideMedia(selectedItem.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to hide')
      return
    }

    media.removeItem(selectedItem.id)
    refreshCounts()
    invalidateMedia()

    const remaining = activeItems.filter((i) => i.id !== selectedItem.id)
    if (remaining.length === 0) {
      setSelectedItem(null)
    } else if (currentIndex < remaining.length) {
      setSelectedItem(remaining[currentIndex])
    } else {
      setSelectedItem(remaining[remaining.length - 1])
    }
  }, [
    selectedItem,
    activeItems,
    media,
    refreshCounts,
    invalidateMedia,
    setSelectedItem,
  ])

  const handleUnhide = useCallback(async () => {
    if (!selectedItem) return
    const currentIndex = activeItems.findIndex((i) => i.id === selectedItem.id)

    try {
      await unhideMedia(selectedItem.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unhide')
      return
    }

    hidden.removeItems([selectedItem.id])
    refreshCounts()
    invalidateMedia()

    const remaining = activeItems.filter((i) => i.id !== selectedItem.id)
    if (remaining.length === 0) {
      setSelectedItem(null)
    } else if (currentIndex < remaining.length) {
      setSelectedItem(remaining[currentIndex])
    } else {
      setSelectedItem(remaining[remaining.length - 1])
    }
  }, [
    selectedItem,
    activeItems,
    hidden,
    refreshCounts,
    invalidateMedia,
    setSelectedItem,
  ])

  const handleToggleFavorite = useCallback(async () => {
    if (!selectedItem) return
    try {
      const result = await toggleFavorite(selectedItem.id)
      setSelectedItem({
        ...selectedItem,
        favorited_at: result.favorited ? new Date().toISOString() : null,
      })
      refreshCounts()
      invalidateMedia()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update favorite',
      )
    }
  }, [selectedItem, refreshCounts, invalidateMedia, setSelectedItem])

  return {
    selectedItem,
    setSelectedItem,
    selectedIndex,
    justClosedLightboxRef,
    handlePrev,
    handleNext,
    handleClose,
    handleToggleSelect,
    handleHide:
      viewMode === 'normal' || viewMode === 'people' ? handleHide : undefined,
    handleUnhide: viewMode === 'hidden' ? handleUnhide : undefined,
    handleToggleFavorite,
  }
}
