import { useEffect, useRef } from 'react'

interface ShortcutGroup {
  title: string
  shortcuts: { key: string; description: string }[]
}

const groups: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { key: '?', description: 'Show keyboard shortcuts' },
      { key: 'C', description: 'Toggle chats panel' },
      { key: 'M', description: 'Go to main view' },
      { key: 'P', description: 'Go to people view' },
      { key: 'F', description: 'Go to favorites view' },
      { key: 'H', description: 'Toggle hidden media view' },
      { key: 'Shift+H', description: 'Toggle hidden chats' },
      { key: 'Shift+D', description: 'Hide selected groups' },
      { key: 'Esc', description: 'Exit select mode / close modal' },
    ],
  },
  {
    title: 'Lightbox',
    shortcuts: [
      { key: '\u2190', description: 'Previous item' },
      { key: '\u2192', description: 'Next item' },
      { key: 'S', description: 'Toggle selection' },
      { key: 'H', description: 'Toggle hide' },
      { key: 'F', description: 'Toggle favorite' },
    ],
  },
  {
    title: 'Selection mode',
    shortcuts: [
      { key: 'H', description: 'Hide selected items' },
      { key: 'F', description: 'Toggle favorite' },
    ],
  },
]

interface Props {
  onClose: () => void
}

export default function ShortcutsModal({ onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="open:flex items-center justify-center backdrop:bg-black/60 bg-transparent p-0 m-0 max-w-none max-h-none w-screen h-screen"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close()
      }}
    >
      <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-lg bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text">Keyboard shortcuts</h2>
          <button className="text-text-soft hover:text-text" onClick={onClose}>
            <svg
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M6 6l8 8M14 6l-8 8" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-soft">
                {group.title}
              </h3>
              <div className="flex flex-col gap-1.5">
                {group.shortcuts.map((s) => (
                  <div
                    key={s.description}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-text">{s.description}</span>
                    <kbd className="ml-4 shrink-0 rounded bg-surface-alt px-2 py-0.5 text-xs font-mono text-text-soft">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </dialog>
  )
}
