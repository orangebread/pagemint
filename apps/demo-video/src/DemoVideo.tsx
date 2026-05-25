import { AbsoluteFill, Sequence } from "remotion";
import { Card } from "./scenes/Card";
import { ClipScene } from "./scenes/ClipScene";
import { brand } from "./brand";
import { clip1Captions, clip2Captions } from "./captions";

export type PageMintDemoProps = {
  clip1: string | null;
  clip2: string | null;
  clip1Frames: number;
  clip2Frames: number;
  introFrames: number;
  outroFrames: number;
  gapFrames: number;
  fps: number;
};

export const PageMintDemo: React.FC<PageMintDemoProps> = ({
  clip1,
  clip2,
  clip1Frames,
  clip2Frames,
  introFrames,
  outroFrames,
  gapFrames,
}) => {
  const safeClip1 = clip1Frames > 0 ? clip1Frames : 90;
  const safeClip2 = clip2Frames > 0 ? clip2Frames : 90;

  let cursor = 0;
  const introStart = cursor;
  cursor += introFrames;
  const clip1Start = cursor;
  cursor += safeClip1;
  cursor += gapFrames;
  const clip2Start = cursor;
  cursor += safeClip2;
  const outroStart = cursor;

  return (
    <AbsoluteFill style={{ background: brand.cream }}>
      <Sequence from={introStart} durationInFrames={introFrames} name="Intro">
        <Card
          variant="intro"
          tagline="Save any page. Trustworthy PDF."
          url="https://pagemint.space"
        />
      </Sequence>

      <Sequence
        from={clip1Start}
        durationInFrames={safeClip1}
        name="Capture clip"
      >
        <ClipScene
          src={clip1}
          fallbackTitle="Capture from the extension"
          captions={clip1Captions}
        />
      </Sequence>

      <Sequence
        from={clip2Start}
        durationInFrames={safeClip2}
        name="Render clip"
      >
        <ClipScene
          src={clip2}
          fallbackTitle="Review and save locally"
          captions={clip2Captions}
        />
      </Sequence>

      <Sequence from={outroStart} durationInFrames={outroFrames} name="Outro">
        <Card
          variant="outro"
          tagline="Privacy-first capture."
          url="https://pagemint.space"
        />
      </Sequence>
    </AbsoluteFill>
  );
};
