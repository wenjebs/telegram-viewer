import { Composition } from 'remotion'
import { LogoAnimation } from './LogoAnimation'

const Placeholder = () => <div style={{ background: '#0a0a0a', width: '100%', height: '100%' }} />

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="LogoAnimation"
        component={LogoAnimation}
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
