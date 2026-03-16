import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { getAuthStatus, syncGroup } from '#/api/client'
import type { MediaItem } from '#/api/types'
import AuthFlow from '#/components/AuthFlow'
import Sidebar from '#/components/Sidebar'
import MediaGrid from '#/components/MediaGrid'
import Lightbox from '#/components/Lightbox'
import { useGroups } from '#/hooks/useGroups'
import { useMedia } from '#/hooks/useMedia'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [syncing, setSyncing] = useState(false)

  const { groups, toggleActive, activeGroupIds } = useGroups()
  const { items, loading, hasMore, fetchMedia, reset } = useMedia()

  useEffect(() => {
    getAuthStatus()
      .then((s) => setAuthenticated(s.authenticated))
      .catch(() => setAuthenticated(false))
  }, [])

  useEffect(() => {
    if (!authenticated) return
    reset()
    fetchMedia({
      groups: activeGroupIds,
      type: mediaTypeFilter ?? undefined,
      reset: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, activeGroupIds.join(','), mediaTypeFilter])

  const handleSync = async () => {
    setSyncing(true)
    for (const gid of activeGroupIds) {
      try {
        await syncGroup(gid)
      } catch {
        // continue syncing other groups
      }
    }
    setSyncing(false)
    reset()
    fetchMedia({
      groups: activeGroupIds,
      type: mediaTypeFilter ?? undefined,
      reset: true,
    })
  }

  const handleLoadMore = () => {
    fetchMedia({ groups: activeGroupIds, type: mediaTypeFilter ?? undefined })
  }

  const selectedIndex = selectedItem
    ? items.findIndex((i) => i.id === selectedItem.id)
    : -1
  const handlePrev = () => {
    if (selectedIndex > 0) setSelectedItem(items[selectedIndex - 1])
  }
  const handleNext = () => {
    if (selectedIndex < items.length - 1)
      setSelectedItem(items[selectedIndex + 1])
  }

  if (authenticated === null) return null
  if (!authenticated)
    return <AuthFlow onAuthenticated={() => setAuthenticated(true)} />

  return (
    <div className="flex h-screen">
      <Sidebar
        groups={groups}
        onToggleGroup={toggleActive}
        mediaTypeFilter={mediaTypeFilter}
        onMediaTypeFilter={setMediaTypeFilter}
        onSync={handleSync}
        syncing={syncing}
      />
      <MediaGrid
        items={items}
        hasMore={hasMore}
        loading={loading}
        onLoadMore={handleLoadMore}
        onItemClick={setSelectedItem}
      />
      {selectedItem && (
        <Lightbox
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onPrev={handlePrev}
          onNext={handleNext}
          hasPrev={selectedIndex > 0}
          hasNext={selectedIndex < items.length - 1}
        />
      )}
    </div>
  )
}
