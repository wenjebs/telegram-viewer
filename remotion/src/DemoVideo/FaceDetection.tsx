import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { theme } from '../shared/theme'

const faces = [
  { x: 180, y: 120, w: 80, h: 96 },
  { x: 340, y: 100, w: 70, h: 84 },
  { x: 520, y: 140, w: 75, h: 90 },
]

const avatarColors = ['#1e3a5f', '#2d1b4e', '#1a3c34']

export const FaceDetection: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

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
        }}
      >
        <div style={{ color: theme.colors.text, fontWeight: 600, fontSize: 16 }}>
          People
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 24,
          padding: 24,
          flex: 1,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 700,
            height: 450,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
            overflow: 'hidden',
          }}
        >
          {faces.map((face, i) => {
            const boxSpring = spring({
              frame: frame - i * 8,
              fps,
              config: { damping: 12, stiffness: 200, mass: 0.8 },
            })
            const scale = interpolate(boxSpring, [0, 1], [1.3, 1])
            const opacity = interpolate(boxSpring, [0, 1], [0, 1])

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: face.x,
                  top: face.y,
                  width: face.w,
                  height: face.h,
                  border: `2px solid ${theme.colors.accent}`,
                  borderRadius: 6,
                  boxShadow: `0 0 12px ${theme.colors.accentGlow}`,
                  transform: `scale(${scale})`,
                  opacity,
                }}
              />
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          {avatarColors.map((color, i) => {
            const chipSpring = spring({
              frame: frame - 30 - i * 5,
              fps,
              config: { damping: 15, stiffness: 150, mass: 1 },
            })
            const translateX = interpolate(chipSpring, [0, 1], [40, 0])
            const opacity = interpolate(chipSpring, [0, 1], [0, 1])

            const isSelected = i === 0 && frame >= 60
            const selectOpacity = isSelected
              ? interpolate(frame, [60, 65], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 0

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  transform: `translateX(${translateX}px)`,
                  opacity,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: selectOpacity > 0
                    ? `rgba(2, 132, 199, ${selectOpacity * 0.15})`
                    : 'transparent',
                  border: selectOpacity > 0
                    ? `1px solid rgba(2, 132, 199, ${selectOpacity * 0.3})`
                    : '1px solid transparent',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${color}, ${color}dd)`,
                    border: `2px solid ${theme.colors.border}`,
                  }}
                />
                <div>
                  <div style={{ color: theme.colors.text, fontSize: 13, fontWeight: 500 }}>
                    Person {i + 1}
                  </div>
                  <div style={{ color: theme.colors.textSubtle, fontSize: 11 }}>
                    {12 - i * 3} photos
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}
