import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Logo } from './shared/Logo'
import { theme } from './shared/theme'

export const LogoAnimation: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Phase 1: Fade in (0-15 frames / 0-0.5s)
  const fadeIn = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  })

  // Phase 2: Searching pulse (frames 15-45 / 0.5-1.5s)
  const pulsePhase = interpolate(frame, [15, 45], [0, Math.PI * 3], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const pulseScale = frame >= 15 && frame < 45
    ? 1 + 0.05 * Math.sin(pulsePhase)
    : 1

  // Phase 3: Snap (frame 45 / 1.5s) — spring contraction
  const snapSpring = spring({
    frame: frame - 45,
    fps,
    config: { damping: 20, stiffness: 200, mass: 1 },
  })
  const snapScale = frame >= 45
    ? interpolate(snapSpring, [0, 1], [1, 0.85])
    : pulseScale

  // Color transition: white@30% → sky blue → white
  const isSearching = frame < 45
  const isSnapping = frame >= 45 && frame < 60
  const bracketColor = isSearching
    ? theme.colors.bracketSearch
    : isSnapping
      ? theme.colors.accent
      : '#ffffff'
  const bracketOpacity = isSearching ? fadeIn * 0.3 : 1

  // Dot appears at snap
  const dotOpacity = interpolate(frame, [45, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Glow during snap
  const glowOpacity = isSnapping
    ? interpolate(frame, [45, 55, 60], [0, 0.6, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0

  // Text fade in (frames 60-72 / 2.0-2.4s)
  const textOpacity = interpolate(frame, [60, 72], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const textY = interpolate(frame, [60, 72], [8, 0], {
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
        gap: 12,
        fontFamily: theme.fontFamily,
      }}
    >
      <div style={{ position: 'relative' }}>
        {/* Glow effect behind logo during snap */}
        {glowOpacity > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: -20,
              borderRadius: 30,
              background: theme.colors.accent,
              opacity: glowOpacity,
              filter: 'blur(20px)',
            }}
          />
        )}
        <div style={{ transform: `scale(${snapScale})` }}>
          <Logo
            size={80}
            bracketColor={bracketColor}
            bracketOpacity={bracketOpacity}
            dotColor={isSnapping ? theme.colors.accent : '#ffffff'}
            dotOpacity={dotOpacity}
          />
        </div>
      </div>
      <div
        style={{
          color: theme.colors.text,
          fontSize: 20,
          fontWeight: 600,
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          letterSpacing: -0.3,
        }}
      >
        Telegram Viewer
      </div>
    </AbsoluteFill>
  )
}
