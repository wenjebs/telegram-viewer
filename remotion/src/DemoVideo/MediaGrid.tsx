import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { theme } from '../shared/theme'

const COLS = 4
const ROWS = 4
const GAP = 6
const TILE_SIZE = 150

const gradients = [
  ['#1a1a2e', '#16213e'],
  ['#0f3460', '#1a1a2e'],
  ['#16213e', '#1a1a2e'],
  ['#1a1a2e', '#0f3460'],
  ['#1a1a2e', '#16213e'],
  ['#16213e', '#0f3460'],
  ['#0f3460', '#16213e'],
  ['#1a1a2e', '#16213e'],
  ['#16213e', '#1a1a2e'],
  ['#1a1a2e', '#0f3460'],
  ['#0f3460', '#1a1a2e'],
  ['#16213e', '#0f3460'],
  ['#1a1a2e', '#16213e'],
  ['#0f3460', '#16213e'],
  ['#16213e', '#1a1a2e'],
  ['#1a1a2e', '#0f3460'],
]

export const MediaGrid: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scrollY = interpolate(frame, [30, 90], [0, -80], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const gridWidth = COLS * TILE_SIZE + (COLS - 1) * GAP
  const gridLeft = (1280 - gridWidth) / 2

  return (
    <AbsoluteFill
      style={{
        background: theme.colors.background,
        fontFamily: theme.fontFamily,
      }}
    >
      <div
        style={{
          height: 52,
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 12,
        }}
      >
        <div style={{ color: theme.colors.text, fontWeight: 600, fontSize: 16 }}>
          Telegram Viewer
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            width: 140,
            height: 28,
            borderRadius: 6,
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
          }}
        />
      </div>

      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          paddingTop: 20,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, ${TILE_SIZE}px)`,
            gap: GAP,
            transform: `translateY(${scrollY}px)`,
          }}
        >
          {gradients.map((gradient, i) => {
            const staggerDelay = i * 2
            const tileSpring = spring({
              frame: frame - staggerDelay,
              fps,
              config: { damping: 15, stiffness: 120, mass: 0.8 },
            })
            const scale = interpolate(tileSpring, [0, 1], [0.8, 1])
            const opacity = interpolate(tileSpring, [0, 1], [0, 1])

            return (
              <div
                key={i}
                style={{
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  borderRadius: 4,
                  background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
                  transform: `scale(${scale})`,
                  opacity,
                }}
              />
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}
