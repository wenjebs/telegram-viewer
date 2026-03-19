import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { theme } from '../shared/theme'

export const PhotoLightbox: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const openSpring = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 150, mass: 1 },
  })

  const closeSpring = spring({
    frame: frame - 60,
    fps,
    config: { damping: 20, stiffness: 200, mass: 1 },
  })

  const isClosing = frame >= 60

  const scale = isClosing
    ? interpolate(closeSpring, [0, 1], [1, 0.15])
    : interpolate(openSpring, [0, 1], [0.15, 1])

  const backdropOpacity = isClosing
    ? interpolate(closeSpring, [0, 1], [0.8, 0])
    : interpolate(openSpring, [0, 1], [0, 0.8])

  const imageX = isClosing
    ? interpolate(closeSpring, [0, 1], [0, -200])
    : interpolate(openSpring, [0, 1], [-200, 0])
  const imageY = isClosing
    ? interpolate(closeSpring, [0, 1], [0, -150])
    : interpolate(openSpring, [0, 1], [-150, 0])

  return (
    <AbsoluteFill style={{ background: theme.colors.background }}>
      <AbsoluteFill style={{ opacity: 1 - backdropOpacity * 0.5 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 150px)',
            gap: 6,
            position: 'absolute',
            top: 72,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 150,
                height: 150,
                borderRadius: 4,
                background: `linear-gradient(135deg, #1a1a2e, ${i % 2 === 0 ? '#16213e' : '#0f3460'})`,
                opacity: 0.4,
              }}
            />
          ))}
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background: `rgba(0, 0, 0, ${backdropOpacity})`,
        }}
      />

      <AbsoluteFill
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 500,
            height: 350,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
            transform: `scale(${scale}) translate(${imageX}px, ${imageY}px)`,
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
