import {
  type CanvasDocument,
  FONT_REGISTRY,
  FONT_STACKS,
  getBundledFontStack,
  isBundledFontName,
  type TextFontRef,
} from '../types/config';
import { ensureImportedFontLoaded, getCachedImportedFont, isFontUri } from './fontStore';

const loadedCanvasFonts = new Set<string>();

function hasFontFaceSet(): boolean {
  return typeof document !== 'undefined' && 'fonts' in document;
}

export function collectDocumentFontNames(doc: CanvasDocument): TextFontRef[] {
  return Array.from(new Set(doc.layers.filter((layer) => layer.kind === 'text').map((layer) => layer.font)));
}

export function getCanvasFontStack(font: TextFontRef): string {
  if (isFontUri(font)) {
    const asset = getCachedImportedFont(font);
    return asset ? `"${asset.family}", ${FONT_STACKS.MONO}` : FONT_STACKS.MONO;
  }
  return getBundledFontStack(font);
}

export async function ensureCanvasFontLoaded(font: TextFontRef, sizePx = 64): Promise<void> {
  if (loadedCanvasFonts.has(font) || !hasFontFaceSet()) return;

  if (isFontUri(font)) {
    await ensureImportedFontLoaded(font);
    loadedCanvasFonts.add(font);
    return;
  }

  if (!isBundledFontName(font)) return;

  const fonts = document.fonts;
  const family = FONT_REGISTRY[font]?.family;
  const stack = getCanvasFontStack(font);
  const spec = `${Math.max(1, Math.round(sizePx))}px ${family ? `"${family}"` : stack}`;

  try {
    await fonts.load(spec);
    loadedCanvasFonts.add(font);
  } catch {
    // Canvas can still render with the fallback stack. Missing webfonts should
    // not block export, but successful loads improve preview/export parity.
  }
}
