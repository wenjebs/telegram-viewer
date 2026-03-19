import {
  interpolate,
  useCurrentFrame,
} from 'remotion'

interface CursorKeyframe {
  frame: number
  x: number
  y: number
  click?: boolean
}

interface FakeCursorProps {
  keyframes: CursorKeyframe[]
}

export const FakeCursor: React.FC<FakeCursorProps> = ({ keyframes }) => {
  const frame = useCurrentFrame()

  if (keyframes.length === 0) return null

  let prev = keyframes[0]
  let next = keyframes[0]
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (frame >= keyframes[i].frame && frame <= keyframes[i + 1].frame) {
      prev = keyframes[i]
      next = keyframes[i + 1]
      break
    }
    if (frame > keyframes[i + 1].frame) {
      prev = keyframes[i + 1]
      next = keyframes[i + 1]
    }
  }

  const progress = prev === next
    ? 1
    : interpolate(
        frame,
        [prev.frame, next.frame],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )

  const eased = progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2

  const x = prev.x + (next.x - prev.x) * eased
  const y = prev.y + (next.y - prev.y) * eased

  const activeClick = keyframes.find(
    (kf) => kf.click && Math.abs(frame - kf.frame) < 10,
  )
  const clickOpacity = activeClick
    ? interpolate(
        frame,
        [activeClick.frame, activeClick.frame + 10],
        [0.5, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0
  const clickScale = activeClick
    ? interpolate(
        frame,
        [activeClick.frame, activeClick.frame + 10],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      {clickOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: '2px solid rgba(255, 255, 255, 0.6)',
            transform: `translate(-50%, -50%) scale(${clickScale})`,
            opacity: clickOpacity,
          }}
        />
      )}
      <svg
        width="18"
        height="22"
        viewBox="0 0 18 22"
        fill="none"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
      >
        <path
          d="M1 1L1 17.5L5.5 13L10 21L13 19.5L8.5 11.5L14.5 11.5L1 1Z"
          fill="white"
          stroke="black"
          strokeWidth="1.2"
        />
      </svg>
    </div>
  )
}
