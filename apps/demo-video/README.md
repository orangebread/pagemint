# @pagemint/demo-video

Remotion composition that renders a short, captioned PageMint demo video from tracked source. The default public build uses generated product mockups so the repository does not depend on private screen recordings.

## One-time setup

```bash
# from repo root
pnpm install
```

Optional local recordings can be placed in `public/` for one-off marketing renders. These files stay ignored and must not be committed:

```bash
cp /path/to/capture-recording.mov apps/demo-video/public/clip-1.mov
cp /path/to/render-recording.mov apps/demo-video/public/clip-2.mov
```

Get clip durations and update `src/Root.tsx`:

```bash
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 \
  apps/demo-video/public/clip-1.mov
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 \
  apps/demo-video/public/clip-2.mov
```

Set `CLIP_1_FRAMES` and `CLIP_2_FRAMES` in `src/Root.tsx` to `ceil(duration * 30)`, and pass those clips through Remotion props for local-only renders. The default `pnpm --filter @pagemint/demo-video build` path intentionally remains self-contained.

## Develop

```bash
pnpm --filter @pagemint/demo-video dev   # opens Remotion Studio
```

## Render

```bash
# MP4 (1280x720, 30fps)
pnpm --filter @pagemint/demo-video build

# GIF (Remotion supports gif codec directly)
pnpm --filter @pagemint/demo-video build:gif
```

Output: `apps/demo-video/out/pagemint-demo.{mp4,gif}`.

## Smaller GIF

Remotion's gif encoder is lossless-ish and can balloon. For lean GIFs, render MP4 first then convert:

```bash
ffmpeg -i out/pagemint-demo.mp4 \
  -vf "fps=15,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 out/pagemint-demo.gif
```

Tweak `fps`, `scale`, and `max_colors` to trade size vs. quality.

## Editing captions

Edit `src/captions.ts`. Each entry is `{ fromFrame, durationFrames, text }` relative to the scene start. 30 frames = 1 second.

## Editing layout

- `src/Root.tsx` — composition config (size, fps, total length, clip frame counts).
- `src/DemoVideo.tsx` — scene order and timing.
- `src/scenes/Card.tsx` — title/outro card styling.
- `src/scenes/ClipScene.tsx` — clip + caption overlay.
- `src/scenes/Caption.tsx` — caption rendering.
