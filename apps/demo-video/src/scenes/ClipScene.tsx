import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { CaptionTrack } from "./Caption";
import { brand } from "../brand";
import type { Caption } from "../captions";

type Props = {
  src?: string | null;
  fallbackTitle: string;
  captions: Caption[];
  fadeFrames?: number;
};

const CAPTION_BAND_HEIGHT = 96;

export const ClipScene: React.FC<Props> = ({
  src,
  fallbackTitle,
  captions,
  fadeFrames = 8,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, fadeFrames], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: brand.cream3, opacity: fadeIn }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: 24,
          paddingBottom: 0,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* Clip card — printed-page feel */}
        <div
          style={{
            position: "relative",
            flex: 1,
            border: `1px solid ${brand.rule}`,
            borderRadius: 6,
            overflow: "hidden",
            background: brand.cream,
            boxShadow: "0 18px 60px rgba(23,19,14,0.18)",
          }}
        >
          {src ? (
            <OffthreadVideo
              src={src}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          ) : (
            <FallbackClip title={fallbackTitle} />
          )}
        </div>

        {/* Caption band — sits BELOW the clip card on cream3.
            No overlay, no darkening of clip content. */}
        <div
          style={{
            flex: `0 0 ${CAPTION_BAND_HEIGHT}px`,
            position: "relative",
          }}
        >
          <CaptionTrack captions={captions} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const FallbackClip: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [8, 74], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorX = interpolate(frame, [20, 82], [120, 835], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorY = interpolate(frame, [20, 82], [118, 320], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: brand.cream,
        color: brand.ink,
        fontFamily:
          "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: 42,
      }}
    >
      <div
        style={{
          height: "100%",
          display: "grid",
          gridTemplateRows: "44px 1fr 72px",
          border: `1px solid ${brand.rule}`,
          background: brand.cream2,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 18px",
            borderBottom: `1px solid ${brand.rule}`,
            color: brand.ink2,
            fontSize: 16,
          }}
        >
          <span>PageMint</span>
          <span style={{ color: brand.mintDeep }}>{title}</span>
        </div>

        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "220px 1fr",
            minHeight: 0,
          }}
        >
          <div
            style={{
              borderRight: `1px solid ${brand.rule}`,
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {["Defaults", "Permissions", "History"].map((label, index) => (
              <div
                key={label}
                style={{
                  height: 38,
                  borderRadius: 5,
                  background: index === 0 ? brand.mint : brand.cream,
                  border: `1px solid ${index === 0 ? brand.mintDeep : brand.rule}`,
                  color: index === 0 ? brand.ink : brand.ink2,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 14,
                  fontWeight: index === 0 ? 700 : 500,
                }}
              >
                {label}
              </div>
            ))}
          </div>

          <div
            style={{
              padding: 24,
              display: "grid",
              gridTemplateRows: "42px repeat(4, 1fr)",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 260,
                height: 30,
                borderRadius: 4,
                background: brand.ink,
                opacity: 0.9,
              }}
            />
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px",
                  gap: 16,
                  alignItems: "center",
                  padding: "0 18px",
                  border: `1px solid ${brand.rule}`,
                  borderRadius: 6,
                  background: brand.cream,
                }}
              >
                <div
                  style={{
                    height: 16,
                    width: `${72 - row * 8}%`,
                    borderRadius: 999,
                    background: brand.ink3,
                    opacity: 0.45,
                  }}
                />
                <div
                  style={{
                    height: 30,
                    borderRadius: 999,
                    background: row === 1 ? brand.mintDeep : brand.rule,
                  }}
                />
              </div>
            ))}
          </div>

          <div
            style={{
              position: "absolute",
              left: cursorX,
              top: cursorY,
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: `3px solid ${brand.mintDeep}`,
              background: "rgba(184, 212, 190, 0.55)",
              boxShadow: "0 8px 22px rgba(23,19,14,0.25)",
            }}
          />
        </div>

        <div
          style={{
            borderTop: `1px solid ${brand.rule}`,
            display: "flex",
            alignItems: "center",
            padding: "0 22px",
            gap: 18,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 999,
              background: brand.rule,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: "100%",
                background: brand.mintDeep,
              }}
            />
          </div>
          <div style={{ color: brand.ink2, fontWeight: 700 }}>
            Local capture
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
