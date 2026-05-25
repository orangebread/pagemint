// Captions are anchored relative to scene start (in frames @ 30fps).
// Each scene gets its own track; timings are clamped to scene length at render.

export type Caption = {
  fromFrame: number;
  durationFrames: number;
  text: string;
};

// clip-1 ≈ 290 frames (9.65s). Pace captions across it.
export const clip1Captions: Caption[] = [
  { fromFrame: 8, durationFrames: 60, text: "Open any page." },
  { fromFrame: 72, durationFrames: 70, text: "Click PageMint to capture it." },
  { fromFrame: 148, durationFrames: 68, text: "Article-scoped DOM, exact." },
  { fromFrame: 220, durationFrames: 66, text: "No sync. No telemetry." },
];

// clip-2 ≈ 254 frames (8.44s).
export const clip2Captions: Caption[] = [
  { fromFrame: 8, durationFrames: 110, text: "Render to a trustworthy PDF." },
  { fromFrame: 130, durationFrames: 115, text: "Saved locally. Yours." },
];
