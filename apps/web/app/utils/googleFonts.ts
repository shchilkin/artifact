import type { PortableFontAsset } from '../types/config';

export const GOOGLE_FONTS_CSS2_URL = 'https://fonts.googleapis.com/css2';
export const GOOGLE_FONTS_LICENSE_NAME = 'SIL Open Font License 1.1';
export const GOOGLE_FONTS_LICENSE_URL = 'https://openfontlicense.org';

export interface GoogleFontRequest {
  family: string;
  cssUrl: string;
}

export interface ParsedGoogleFontFace {
  family: string;
  fontUrl: string;
  format: string;
  unicodeRange?: string;
}

function normalizeFamilyName(value: string) {
  return value.replaceAll('+', ' ').replaceAll(/\s+/g, ' ').trim();
}

function googleFamilyParam(family: string) {
  return encodeURIComponent(normalizeFamilyName(family)).replaceAll('%20', '+');
}

function ensureDisplaySwap(url: URL) {
  if (!url.searchParams.has('display')) url.searchParams.set('display', 'swap');
  return url.toString();
}

export function createGoogleFontRequest(input: string): GoogleFontRequest | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.hostname !== 'fonts.googleapis.com' || !url.pathname.startsWith('/css')) return null;
    const familyParam = url.searchParams.get('family');
    if (!familyParam) return null;
    const family = normalizeFamilyName(familyParam.split(':')[0] ?? '');
    if (!family) return null;
    return { family, cssUrl: ensureDisplaySwap(url) };
  } catch {
    const family = normalizeFamilyName(trimmed);
    if (!family) return null;
    return { family, cssUrl: `${GOOGLE_FONTS_CSS2_URL}?family=${googleFamilyParam(family)}&display=swap` };
  }
}

function unquote(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

export function parseGoogleFontFaces(css: string): ParsedGoogleFontFace[] {
  const blocks = css.match(/@font-face\s*{[^}]+}/g) ?? [];
  return blocks.flatMap((block) => {
    const family = block.match(/font-family:\s*([^;]+);/i)?.[1];
    const src = block.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?([^'")]+)['"]?\)/i);
    if (!family || !src?.[1]) return [];
    return [
      {
        family: unquote(family),
        fontUrl: unquote(src[1]),
        format: src[2] || 'woff2',
        unicodeRange: block.match(/unicode-range:\s*([^;]+);/i)?.[1]?.trim(),
      },
    ];
  });
}

export function pickGoogleFontFace(faces: readonly ParsedGoogleFontFace[]): ParsedGoogleFontFace | null {
  return (
    faces.find((face) => face.format.toLowerCase() === 'woff2' && face.unicodeRange?.includes('U+0000-00FF')) ??
    faces.find((face) => face.format.toLowerCase() === 'woff2') ??
    faces[0] ??
    null
  );
}

function mimeForGoogleFontFormat(format: string) {
  const normalized = format.toLowerCase();
  if (normalized === 'woff2') return 'font/woff2';
  if (normalized === 'woff') return 'font/woff';
  if (normalized === 'truetype' || normalized === 'ttf') return 'font/ttf';
  if (normalized === 'opentype' || normalized === 'otf') return 'font/otf';
  return 'application/octet-stream';
}

export function createGoogleFontAssetMetadata({
  id,
  family,
  request,
  face,
  dataUrl,
  bytes,
  createdAt = new Date().toISOString(),
}: {
  id: string;
  family: string;
  request: GoogleFontRequest;
  face: ParsedGoogleFontFace;
  dataUrl: string;
  bytes: number;
  createdAt?: string;
}): PortableFontAsset {
  return {
    id,
    dataUrl,
    mime: mimeForGoogleFontFormat(face.format),
    bytes,
    label: family,
    family: `Artifact Google ${id.replaceAll(/[^a-zA-Z0-9]+/g, ' ').trim()}`,
    createdAt,
    source: 'google-fonts',
    sourceName: `${family} (Google Fonts)`,
    sourceUrl: request.cssUrl,
    license: {
      name: GOOGLE_FONTS_LICENSE_NAME,
      url: GOOGLE_FONTS_LICENSE_URL,
      allowsEmbedding: true,
    },
    embeddingPolicy: 'open-license-embeddable',
  };
}
