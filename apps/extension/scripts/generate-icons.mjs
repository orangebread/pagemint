#!/usr/bin/env node
/**
 * Render PageMint extension icons from SVG sources.
 *
 * Inputs:  apps/extension/icons/source/{16,32,48,128}.svg
 * Outputs: apps/extension/public/icon/{16,32,48,128}.png
 *
 * Each source SVG is hand-tuned for its target size (border weight, dot, grain).
 * Run: pnpm --filter @pagemint/extension run icons
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_DIR = resolve(ROOT, 'icons/source');
const OUT_DIR = resolve(ROOT, 'public/icon');
const SIZES = [16, 32, 48, 128];

async function renderSize(size) {
  const srcPath = resolve(SRC_DIR, `${size}.svg`);
  const outPath = resolve(OUT_DIR, `${size}.png`);
  const svg = await readFile(srcPath);
  // density=600 supersamples then downsamples; produces sharper output for tiny SVGs
  const density = Math.max(72, Math.round((600 / size) * 4));
  const png = await sharp(svg, { density })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  await writeFile(outPath, png);
  return { size, bytes: png.length, outPath };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const results = await Promise.all(SIZES.map(renderSize));
  for (const r of results) {
    const rel = r.outPath.replace(`${ROOT}/`, '');
    process.stdout.write(`${String(r.size).padStart(3)}px  ${String(r.bytes).padStart(6)} B  ${rel}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
