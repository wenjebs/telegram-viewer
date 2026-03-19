import {
  AbsoluteFill,
  interpolate,
  Sequence,
  useCurrentFrame,
} from 'remotion'
import { MediaGrid } from './DemoVideo/MediaGrid'
import { PhotoLightbox } from './DemoVideo/PhotoLightbox'
import { FaceDetection } from './DemoVideo/FaceDetection'
import { SearchFilter } from './DemoVideo/SearchFilter'
import { EndCard } from './DemoVideo/EndCard'
import { FakeCursor } from './shared/FakeCursor'

// Scene timing (frames at 30fps, 0.3s = 9 frame overlap)
const SCENES = [
  { start: 0, duration: 90, Component: MediaGrid },       // 0-3s
  { start: 81, duration: 90, Component: PhotoLightbox },   // 2.7-5.7s
  { start: 162, duration: 120, Component: FaceDetection },  // 5.4-9.4s
  { start: 273, duration: 90, Component: SearchFilter },    // 9.1-12.1s
  { start: 354, duration: 96, Component: EndCard },         // 11.8-15s
]

const Crossfade: React.FC<{
  children: React.ReactNode
  duration: number
  isFirst?: boolean
  isLast?: boolean
}> = ({ children, duration, isFirst, isLast }) => {
  // useCurrentFrame() returns frame RELATIVE to the parent <Sequence>
  const frame = useCurrentFrame()

  // Fade in over first 9 frames (skip for first scene)
  const fadeIn = isFirst
    ? 1
    : interpolate(frame, [0, 9], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })

  // Fade out over last 9 frames (skip for last scene)
  const fadeOut = isLast
    ? 1
    : interpolate(frame, [duration - 9, duration], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      {children}
    </AbsoluteFill>
  )
}

// Cursor keyframes for the entire video
const cursorKeyframes = [
  // Scene 1: Scroll gesture
  { frame: 10, x: 640, y: 400 },
  { frame: 40, x: 640, y: 350 },
  { frame: 70, x: 640, y: 300 },
  // Scene 2: Click a tile
  { frame: 85, x: 540, y: 250, click: true },
  // Scene 3: Click person chip
  { frame: 230, x: 900, y: 200, click: true },
  // Scene 4: Click search
  { frame: 280, x: 1050, y: 30, click: true },
  // Cursor exits for end card
  { frame: 354, x: 1300, y: 400 },
]

export const DemoVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      {SCENES.map(({ start, duration, Component }, i) => (
        <Sequence key={i} from={start} durationInFrames={duration}>
          <Crossfade
            duration={duration}
            isFirst={i === 0}
            isLast={i === SCENES.length - 1}
          >
            <Component />
          </Crossfade>
        </Sequence>
      ))}
      <FakeCursor keyframes={cursorKeyframes} />
    </AbsoluteFill>
  )
}
