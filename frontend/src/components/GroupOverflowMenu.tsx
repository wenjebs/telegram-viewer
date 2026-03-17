import { useCallback, useEffect, useRef, useState } from 'react'
import type { Group, SyncStatus } from '#/api/schemas'

interface Props {
  group: Group
  syncStatus?: SyncStatus
  onHide: (group: Group) => void
  onUnsync: (group: Group) => void
}

export default function GroupOverflowMenu({
  group,
  syncStatus,
  onHide,
  onUnsync,
}: Props) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleHide = useCallback(() => {
    setOpen(false)
    onHide(group)
  }, [group, onHide])

  const handleUnsync = useCallback(() => {
    setOpen(false)
    const confirmed = window.confirm(
      `Unsync "${group.name}"? This will delete all downloaded media for this group.`,
    )
    if (confirmed) onUnsync(group)
  }, [group, onUnsync])

  const isSyncing = syncStatus?.status === 'syncing'
  const isSynced = group.last_synced !== null

  return (
    <div ref={menuRef} className="relative">
      <button
        className="shrink-0 rounded p-1 text-neutral-500 opacity-0 hover:bg-neutral-700 hover:text-neutral-300 group-hover:opacity-100"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((p) => !p)
        }}
        title="More actions"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-neutral-700 bg-neutral-800 py-1 shadow-lg">
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-amber-400 hover:bg-neutral-700"
            onClick={handleHide}
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
              <circle cx="8" cy="8" r="2" />
              <line x1="2" y1="14" x2="14" y2="2" />
            </svg>
            Hide from sidebar
          </button>
          {isSynced && (
            <>
              <div className="mx-2 my-1 border-t border-neutral-700" />
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 hover:bg-neutral-700 disabled:opacity-50"
                onClick={handleUnsync}
                disabled={isSyncing}
                title={
                  isSyncing ? 'Cannot unsync while sync is in progress' : ''
                }
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
                Unsync & delete media
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
