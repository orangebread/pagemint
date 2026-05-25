import { interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { brand, fonts } from "../brand";
import type { Caption } from "../captions";

const { fontFamily: interFamily } = loadInter("normal", {
  weights: ["500", "600"],
  subsets: ["latin"],
});

type Props = {
  captions: Caption[];
};

// Caption renders INSIDE its parent band (see ClipScene). It does not absolute-
// position over the clip, so the clip content is never dimmed.
export const CaptionTrack: React.FC<Props> = ({ captions }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      {captions.map((c, i) => {
        const local = frame - c.fromFrame;
        if (local < 0 || local > c.durationFrames) return null;
        const fadeIn = interpolate(local, [0, 8], [0, 1], {
          extrapolateRight: "clamp",
        });
        const fadeOut = interpolate(
          local,
          [c.durationFrames - 10, c.durationFrames],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const opacity = Math.min(fadeIn, fadeOut);
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              opacity,
              color: brand.ink,
              fontSize: 26,
              fontFamily: interFamily ?? fonts.sans,
              fontWeight: 600,
              letterSpacing: 0.1,
              paddingLeft: 14,
              borderLeft: `3px solid ${brand.mintDeep}`,
              lineHeight: 1.2,
            }}
          >
            {c.text}
          </span>
        );
      })}
    </div>
  );
};
