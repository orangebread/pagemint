import { Composition } from "remotion";
import { PageMintDemo } from "./DemoVideo";

const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;

const INTRO_FRAMES = FPS * 2; // 2s opening card
const OUTRO_FRAMES = FPS * 2.5; // 2.5s closing card
const GAP_FRAMES = 8; // small breath between clips

// frames = ceil(duration_seconds * 30)
//   clip-1 : 9.65s -> 290
//   clip-2 : 8.44s -> 254
const CLIP_1_FRAMES = 290;
const CLIP_2_FRAMES = 254;

const TOTAL_FRAMES =
  INTRO_FRAMES + CLIP_1_FRAMES + GAP_FRAMES + CLIP_2_FRAMES + OUTRO_FRAMES;

export const Root: React.FC = () => {
  return (
    <Composition
      id="PageMintDemo"
      component={PageMintDemo}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={TOTAL_FRAMES}
      defaultProps={{
        clip1: null,
        clip2: null,
        clip1Frames: CLIP_1_FRAMES,
        clip2Frames: CLIP_2_FRAMES,
        introFrames: INTRO_FRAMES,
        outroFrames: OUTRO_FRAMES,
        gapFrames: GAP_FRAMES,
        fps: FPS,
      }}
    />
  );
};
