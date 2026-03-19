import { useEffect, useRef } from 'react'

interface Props {
  x: number
  y: number
  onHide: () => void
  onClose: () => void
}

export default function PhotoContextMenu({ x, y, onHide, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 160),
    top: Math.min(y, window.innerHeight - 48),
    zIndex: 50,
  }

  return (
    <div ref={menuRef} style={style}>
      <div className="min-w-[140px] rounded-lg border border-border bg-surface py-1 shadow-xl">
        <button
          className="w-full px-3 py-1.5 text-left text-sm text-text hover:bg-hover"
          onClick={onHide}
        >
          Hide photo
        </button>
      </div>
    </div>
  )
}
