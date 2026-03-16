import { useState, useCallback, useRef } from 'react'
import { hideMedia, unhideMedia, toggleFavorite } from '#/api/client'
import type { MediaItem } from '#/api/types'

interface LightboxOptions {
  activeItems: MediaItem[]
  media: { removeItem: (id: number) => void }
  hidden: { removeItems: (ids: number[]) => void }
  selectMode: {
    active: boolean
    isSelected: (id: number) => boolean
    enterSelectMode: (id?: number) => void
    toggle: (id: number) => void
  }
  refreshCounts: () => void
  viewMode: string
}

export function useLightbox({
  activeItems,
  media,
  hidden,
  selectMode,
  refreshCounts,
  viewMode,
}: LightboxOptions) {
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const justClosedLightboxRef = useRef(false)

  const selectedIndex = selectedItem
    ? activeItems.findIndex((i) => i.id === selectedItem.id)
    : -1

  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) setSelectedItem(activeItems[selectedIndex - 1])
  }, [selectedIndex, activeItems])

  const handleNext = useCallback(() => {
    if (selectedIndex < activeItems.length - 1)
      setSelectedItem(activeItems[selectedIndex + 1])
  }, [selectedIndex, activeItems])

  const handleClose = useCallback(() => {
    setSelectedItem(null)
    justClosedLightboxRef.current = true
    requestAnimationFrame(() => {
      justClosedLightboxRef.current = false
    })
  }, [])

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
    } catch {
      return
    }

    media.removeItem(selectedItem.id)
    refreshCounts()

    const remaining = activeItems.filter((i) => i.id !== selectedItem.id)
    if (remaining.length === 0) {
      setSelectedItem(null)
    } else if (currentIndex < remaining.length) {
      setSelectedItem(remaining[currentIndex])
    } else {
      setSelectedItem(remaining[remaining.length - 1])
    }
  }, [selectedItem, activeItems, media, refreshCounts])

  const handleUnhide = useCallback(async () => {
    if (!selectedItem) return
    const currentIndex = activeItems.findIndex((i) => i.id === selectedItem.id)

    try {
      await unhideMedia(selectedItem.id)
    } catch {
      return
    }

    hidden.removeItems([selectedItem.id])
    refreshCounts()

    const remaining = activeItems.filter((i) => i.id !== selectedItem.id)
    if (remaining.length === 0) {
      setSelectedItem(null)
    } else if (currentIndex < remaining.length) {
      setSelectedItem(remaining[currentIndex])
    } else {
      setSelectedItem(remaining[remaining.length - 1])
    }
  }, [selectedItem, activeItems, hidden, refreshCounts])

  const handleToggleFavorite = useCallback(async () => {
    if (!selectedItem) return
    try {
      const result = await toggleFavorite(selectedItem.id)
      setSelectedItem((prev) =>
        prev
          ? {
              ...prev,
              favorited_at: result.favorited ? new Date().toISOString() : null,
            }
          : null,
      )
      refreshCounts()
    } catch {
      // ignore
    }
  }, [selectedItem, refreshCounts])

  return {
    selectedItem,
    setSelectedItem,
    selectedIndex,
    justClosedLightboxRef,
    handlePrev,
    handleNext,
    handleClose,
    handleToggleSelect,
    handleHide: viewMode === 'normal' ? handleHide : undefined,
    handleUnhide: viewMode === 'hidden' ? handleUnhide : undefined,
    handleToggleFavorite,
  }
}
