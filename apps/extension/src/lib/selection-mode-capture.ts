import type { SelectionRect } from '@pagemint/shared-types';

export interface SelectionModeViewportSnapshot {
  scrollX: number;
  scrollY: number;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
}

export interface SelectionModeResolvedCaptureCrop {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  pageWidthPoints: number;
  pageHeightPoints: number;
}

const pdfPointsPerCssPixel = 72 / 96;
const pdfNumberPrecision = 100;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPdfNumber(value: number): string {
  const rounded = Math.round(value * pdfNumberPrecision) / pdfNumberPrecision;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/u, '').replace(/\.$/u, '');
}

function encodeAscii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return globalThis.btoa(binary);
}

function decodeBase64(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/u);

  if (!match) {
    throw new Error('PageMint expected a base64 data URL while preparing the selection capture.');
  }

  return {
    mimeType: match[1] ?? 'application/octet-stream',
    bytes: decodeBase64(match[2])
  };
}

export function resolveSelectionCaptureCrop(
  bounds: SelectionRect,
  viewport: SelectionModeViewportSnapshot,
  imageWidth: number,
  imageHeight: number
): SelectionModeResolvedCaptureCrop | null {
  if (
    !Number.isFinite(bounds.x)
    || !Number.isFinite(bounds.y)
    || !Number.isFinite(bounds.width)
    || !Number.isFinite(bounds.height)
    || bounds.width <= 0
    || bounds.height <= 0
    || !Number.isFinite(viewport.scrollX)
    || !Number.isFinite(viewport.scrollY)
    || !Number.isFinite(viewport.innerWidth)
    || !Number.isFinite(viewport.innerHeight)
    || viewport.innerWidth <= 0
    || viewport.innerHeight <= 0
    || !Number.isFinite(imageWidth)
    || !Number.isFinite(imageHeight)
    || imageWidth <= 0
    || imageHeight <= 0
  ) {
    return null;
  }

  const visibleX = bounds.x - viewport.scrollX;
  const visibleY = bounds.y - viewport.scrollY;
  const visibleRight = visibleX + bounds.width;
  const visibleBottom = visibleY + bounds.height;

  if (
    visibleX < 0
    || visibleY < 0
    || visibleRight > viewport.innerWidth
    || visibleBottom > viewport.innerHeight
  ) {
    return null;
  }

  const scaleX = imageWidth / viewport.innerWidth;
  const scaleY = imageHeight / viewport.innerHeight;

  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    return null;
  }

  const sourceX = clampNumber(Math.round(visibleX * scaleX), 0, Math.max(0, imageWidth - 1));
  const sourceY = clampNumber(Math.round(visibleY * scaleY), 0, Math.max(0, imageHeight - 1));
  const sourceWidth = clampNumber(Math.round(bounds.width * scaleX), 1, Math.max(1, imageWidth - sourceX));
  const sourceHeight = clampNumber(Math.round(bounds.height * scaleY), 1, Math.max(1, imageHeight - sourceY));

  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    pageWidthPoints: Math.max(1, bounds.width * pdfPointsPerCssPixel),
    pageHeightPoints: Math.max(1, bounds.height * pdfPointsPerCssPixel)
  };
}

export function buildSinglePageJpegPdfBase64(
  jpegBase64: string,
  imageWidth: number,
  imageHeight: number,
  pageWidthPoints: number,
  pageHeightPoints: number
): string {
  const jpegBytes = decodeBase64(jpegBase64);
  const contentStream = encodeAscii(
    `q\n${formatPdfNumber(pageWidthPoints)} 0 0 ${formatPdfNumber(pageHeightPoints)} 0 0 cm\n/Im0 Do\nQ\n`
  );
  const header = concatBytes([
    encodeAscii('%PDF-1.4\n%'),
    new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0x0A])
  ]);
  const objects = [
    encodeAscii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    encodeAscii('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
    encodeAscii(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatPdfNumber(pageWidthPoints)} ${formatPdfNumber(pageHeightPoints)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
    ),
    concatBytes([
      encodeAscii(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.max(1, Math.round(imageWidth))} /Height ${Math.max(1, Math.round(imageHeight))} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
      ),
      jpegBytes,
      encodeAscii('\nendstream\nendobj\n')
    ]),
    concatBytes([
      encodeAscii(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n`),
      contentStream,
      encodeAscii('endstream\nendobj\n')
    ])
  ] as const;

  const offsets = [0];
  let runningOffset = header.length;

  for (const objectBytes of objects) {
    offsets.push(runningOffset);
    runningOffset += objectBytes.length;
  }

  const xrefOffset = runningOffset;
  const xref = encodeAscii([
    `xref`,
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF'
  ].join('\n'));

  return uint8ArrayToBase64(concatBytes([header, ...objects, xref]));
}

export async function renderSelectionCaptureToPdfBase64(
  captureDataUrl: string,
  bounds: SelectionRect,
  viewport: SelectionModeViewportSnapshot
): Promise<string> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
    throw new Error('PageMint could not rasterize the selected boundary in this extension runtime.');
  }

  const parsedCapture = parseDataUrl(captureDataUrl);
  const bitmap = await createImageBitmap(
    new Blob([new Uint8Array(parsedCapture.bytes).buffer], { type: parsedCapture.mimeType })
  );

  try {
    const crop = resolveSelectionCaptureCrop(bounds, viewport, bitmap.width, bitmap.height);
    if (!crop) {
      throw new Error(
        'Selection mode requires the confirmed boundary to stay fully visible before export. Retry after scrolling it fully into view.'
      );
    }

    const canvas = new OffscreenCanvas(crop.sourceWidth, crop.sourceHeight);
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('PageMint could not prepare a raster surface for the confirmed selection.');
    }

    context.drawImage(
      bitmap,
      crop.sourceX,
      crop.sourceY,
      crop.sourceWidth,
      crop.sourceHeight,
      0,
      0,
      crop.sourceWidth,
      crop.sourceHeight
    );

    const croppedBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.92
    });
    const croppedBytes = new Uint8Array(await croppedBlob.arrayBuffer());

    return buildSinglePageJpegPdfBase64(
      uint8ArrayToBase64(croppedBytes),
      crop.sourceWidth,
      crop.sourceHeight,
      crop.pageWidthPoints,
      crop.pageHeightPoints
    );
  } finally {
    bitmap.close?.();
  }
}
