import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Logo } from '../shared/Logo'
import { theme } from '../shared/theme'

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 100, mass: 1 },
  })
  const logoScale = interpolate(logoSpring, [0, 1], [0.8, 1])
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1])

  const titleOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const titleY = interpolate(frame, [15, 30], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const taglineOpacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        background: theme.colors.background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        fontFamily: theme.fontFamily,
      }}
    >
      <div
        style={{
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
        }}
      >
        <Logo size={64} />
      </div>
      <div
        style={{
          color: theme.colors.text,
          fontSize: 28,
          fontWeight: 700,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          letterSpacing: -0.5,
        }}
      >
        Telegram Viewer
      </div>
      <div
        style={{
          color: theme.colors.textSubtle,
          fontSize: 15,
          opacity: taglineOpacity,
          letterSpacing: 0.5,
        }}
      >
        Self-hosted. Private. Open source.
      </div>
    </AbsoluteFill>
  )
}
