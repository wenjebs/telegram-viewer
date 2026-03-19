import { Composition } from 'remotion'
import { Logo } from './shared/Logo'
import { theme } from './shared/theme'

const LogoPreview = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    background: theme.colors.background,
    fontFamily: theme.fontFamily,
  }}>
    <Logo size={80} />
  </div>
)

const Placeholder = () => <div style={{ background: '#0a0a0a', width: '100%', height: '100%' }} />

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="LogoAnimation"
        component={LogoPreview}
        durationInFrames={90}
        fps={30}
        width={400}
        height={200}
      />
      <Composition
        id="DemoVideo"
        component={Placeholder}
        durationInFrames={450}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  )
}
