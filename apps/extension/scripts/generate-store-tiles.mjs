#!/usr/bin/env node
// Generates Chrome Web Store promo tiles from the press-brand SVG icons.
// Outputs (sibling to scripts/ and public/ — NOT inside public/, so WXT
// does not bundle these 45 kB of listing artwork into the extension zip):
//   - apps/extension/store-assets/hero-1280x800.png   (large promo tile)
//   - apps/extension/store-assets/small-440x280.png   (small promo tile)
//
// Palette is kept in lockstep with apps/extension/src/styles/tokens.css.
// If you change the cream/ink/mint values there, update the fills below.

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'store-assets');

const CREAM = '#F4EEE1';
const CREAM_2 = '#ECE4D1';
const INK = '#17130E';
const INK_3 = '#766B58';
const MINT_DEEP = '#4A7A5A';

function heroSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
  <rect width="1280" height="800" fill="${CREAM}"/>
  <rect x="0" y="0" width="1280" height="800" fill="${CREAM_2}" opacity="0.35"/>
  <g transform="translate(120 220)" fill="${INK}" font-family="Fraunces, Georgia, serif">
    <text font-size="160" font-style="italic" font-weight="600" letter-spacing="-4">P</text>
    <text x="88" font-size="120" font-weight="500" letter-spacing="-2">ageMint</text>
    <circle cx="745" cy="-10" r="12" fill="${MINT_DEEP}"/>
  </g>
  <text x="120" y="460" fill="${INK}" font-family="Fraunces, Georgia, serif" font-size="64" font-weight="400" letter-spacing="-1.5">
    Print the web,
  </text>
  <text x="120" y="540" fill="${INK}" font-family="Fraunces, Georgia, serif" font-style="italic" font-size="64" font-weight="500" letter-spacing="-1.5">
    faithfully.
  </text>
  <text x="120" y="640" fill="${INK_3}" font-family="IBM Plex Mono, monospace" font-size="22" letter-spacing="3">
    LOCAL-FIRST · NO ACCOUNT · NO SERVERS
  </text>
</svg>`;
}

function smallSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
  <rect width="440" height="280" fill="${CREAM}"/>
  <g transform="translate(40 140)" fill="${INK}" font-family="Fraunces, Georgia, serif">
    <text font-size="72" font-style="italic" font-weight="600" letter-spacing="-2">P</text>
    <text x="40" font-size="56" font-weight="500" letter-spacing="-1">ageMint</text>
    <circle cx="345" cy="-4" r="6" fill="${MINT_DEEP}"/>
  </g>
  <text x="40" y="200" fill="${INK_3}" font-family="IBM Plex Mono, monospace" font-size="12" letter-spacing="2">
    PRINT THE WEB, FAITHFULLY.
  </text>
</svg>`;
}

async function renderPng(svg, width, height, outPath) {
  await sharp(Buffer.from(svg))
    .resize({ width, height, fit: 'contain', background: CREAM })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`wrote ${outPath}`);
}

await mkdir(outDir, { recursive: true });
await renderPng(heroSvg(), 1280, 800, resolve(outDir, 'hero-1280x800.png'));
await renderPng(smallSvg(), 440, 280, resolve(outDir, 'small-440x280.png'));
