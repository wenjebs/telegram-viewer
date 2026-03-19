import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { theme } from '../shared/theme'

const SEARCH_TEXT = 'vacation 2024'

export const SearchFilter: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const typedChars = Math.min(
    Math.floor(Math.max(0, frame - 10) / 3),
    SEARCH_TEXT.length,
  )
  const displayText = SEARCH_TEXT.slice(0, typedChars)
  const showCursor = frame % 20 < 14

  const chipsFrame = 10 + SEARCH_TEXT.length * 3 + 10
  const chip1Spring = spring({
    frame: frame - chipsFrame,
    fps,
    config: { damping: 15, stiffness: 180, mass: 0.8 },
  })
  const chip2Spring = spring({
    frame: frame - chipsFrame - 5,
    fps,
    config: { damping: 15, stiffness: 180, mass: 0.8 },
  })

  const gridFrame = chipsFrame + 15
  const gridOpacity = interpolate(frame, [gridFrame, gridFrame + 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const gridY = interpolate(frame, [gridFrame, gridFrame + 15], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        background: theme.colors.background,
        fontFamily: theme.fontFamily,
        padding: 24,
      }}
    >
      <div
        style={{
          height: 52,
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16,
          paddingBottom: 12,
        }}
      >
        <div style={{ color: theme.colors.text, fontWeight: 600, fontSize: 16 }}>
          Telegram Viewer
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.accent}`,
            borderRadius: 8,
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: 260,
            boxShadow: `0 0 0 3px rgba(2, 132, 199, 0.1)`,
          }}
        >
          <span style={{ color: theme.colors.textSubtle, fontSize: 14 }}>
            🔍
          </span>
          <span style={{ color: theme.colors.text, fontSize: 14 }}>
            {displayText}
            {showCursor && (
              <span style={{ color: theme.colors.accent }}>|</span>
            )}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <div
          style={{
            background: theme.colors.accent,
            color: '#ffffff',
            padding: '4px 14px',
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 500,
            opacity: interpolate(chip1Spring, [0, 1], [0, 1]),
            transform: `scale(${interpolate(chip1Spring, [0, 1], [0.8, 1])})`,
          }}
        >
          Photos
        </div>
        <div
          style={{
            background: theme.colors.surface,
            color: theme.colors.textMuted,
            padding: '4px 14px',
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 500,
            border: `1px solid ${theme.colors.border}`,
            opacity: interpolate(chip2Spring, [0, 1], [0, 1]),
            transform: `scale(${interpolate(chip2Spring, [0, 1], [0.8, 1])})`,
          }}
        >
          2024
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 150px)',
          gap: 6,
          opacity: gridOpacity,
          transform: `translateY(${gridY}px)`,
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 150,
              height: 150,
              borderRadius: 4,
              background: `linear-gradient(${135 + i * 15}deg, #1a1a2e, #0f3460)`,
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  )
}
