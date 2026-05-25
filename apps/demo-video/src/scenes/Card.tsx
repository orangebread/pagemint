import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { brand, fonts } from "../brand";

const { fontFamily: frauncesFamily } = loadFraunces("normal", {
  weights: ["500", "600"],
  subsets: ["latin"],
});
const { fontFamily: interFamily } = loadInter("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});

type Props = {
  variant?: "intro" | "outro";
  tagline?: string;
  url?: string;
};

// Subtle paper noise — matches site globals.css body::before.
const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220' viewBox='0 0 220 220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.09  0 0 0 0 0.07  0 0 0 0 0.05  0 0 0 0.045 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

export const Card: React.FC<Props> = ({
  variant = "intro",
  tagline,
  url,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 14], [0, 1], {
    extrapolateRight: "clamp",
  });
  const lift = interpolate(frame, [0, 22], [12, 0], {
    extrapolateRight: "clamp",
  });
  const dotPop = interpolate(frame, [10, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ruleGrow = interpolate(frame, [16, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const wordSize = 132;

  return (
    <AbsoluteFill
      style={{
        background: brand.cream,
        opacity: fadeIn,
      }}
    >
      {/* paper noise */}
      <AbsoluteFill
        style={{
          backgroundImage: NOISE,
          backgroundSize: "220px 220px",
          opacity: 0.55,
          mixBlendMode: "multiply",
        }}
      />
      {/* soft vignette to feel like printed paper */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 80% at 50% 35%, rgba(23,19,14,0) 0%, rgba(23,19,14,0.06) 100%)",
        }}
      />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          color: brand.ink,
          fontFamily: fonts.sans,
        }}
      >
        <div
          style={{
            transform: `translateY(${lift}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
          }}
        >
          {/* Brand mark — italic P + mint dot, mirrors apps/site/public/brand */}
          <Img
            src={staticFile("brand-paper.svg")}
            style={{
              width: 96,
              height: 96,
              marginBottom: 6,
              filter: "drop-shadow(0 6px 18px rgba(23,19,14,0.10))",
            }}
          />

          {/* Wordmark — italic P + roman ageMint + mint dot.
              Mirrors brandmark SVG which italicizes only the P. */}
          <div
            style={{
              fontFamily: frauncesFamily,
              fontSize: wordSize,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "baseline",
              gap: 0,
              fontVariationSettings: "'opsz' 144",
            }}
          >
            <span
              style={{
                fontStyle: "italic",
                fontWeight: 600,
                fontSize: wordSize * 1.1,
                marginRight: 10,
              }}
            >
              P
            </span>
            <span style={{ fontWeight: 500 }}>ageMint</span>
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: brand.mintDeep,
                marginLeft: 6,
                marginBottom: wordSize * 0.08,
                transform: `scale(${dotPop})`,
                transformOrigin: "center",
              }}
            />
          </div>

          {/* Hairline rule */}
          <div
            style={{
              height: 1,
              width: 320,
              background: brand.rule,
              transform: `scaleX(${ruleGrow})`,
              transformOrigin: "center",
            }}
          />

          {/* Tagline */}
          {tagline ? (
            <div
              style={{
                fontFamily: interFamily,
                fontSize: 26,
                fontWeight: 500,
                color: brand.ink3,
                letterSpacing: 0.1,
              }}
            >
              {tagline}
            </div>
          ) : null}

          {/* URL */}
          {url ? (
            <div
              style={{
                marginTop: 6,
                fontFamily: interFamily,
                fontSize: 20,
                fontWeight: 500,
                color: brand.mintDeep,
                letterSpacing: "0.04em",
              }}
            >
              {url}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
