import { Composition } from 'remotion'
import { LogoAnimation } from './LogoAnimation'
import { DemoVideo } from './DemoVideo'

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
        component={DemoVideo}
        durationInFrames={450}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  )
}
