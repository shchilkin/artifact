import { type CanvasDocument, FONT_REGISTRY, FONT_STACKS, type FontName } from '../types/config';

const loadedCanvasFonts = new Set<FontName>();

function hasFontFaceSet(): boolean {
  return typeof document !== 'undefined' && 'fonts' in document;
}

export function collectDocumentFontNames(doc: CanvasDocument): FontName[] {
  return Array.from(new Set(doc.layers.filter((layer) => layer.kind === 'text').map((layer) => layer.font)));
}

export async function ensureCanvasFontLoaded(font: FontName, sizePx = 64): Promise<void> {
  if (loadedCanvasFonts.has(font) || !hasFontFaceSet()) return;

  const fonts = document.fonts;
  const family = FONT_REGISTRY[font]?.family;
  const stack = FONT_STACKS[font] ?? FONT_STACKS.MONO;
  const spec = `${Math.max(1, Math.round(sizePx))}px ${family ? `"${family}"` : stack}`;

  try {
    await fonts.load(spec);
    loadedCanvasFonts.add(font);
  } catch {
    // Canvas can still render with the fallback stack. Missing webfonts should
    // not block export, but successful loads improve preview/export parity.
  }
}

export async function ensureCanvasFontsLoaded(fonts: readonly FontName[], sizePx = 64): Promise<void> {
  await Promise.all(Array.from(new Set(fonts)).map((font) => ensureCanvasFontLoaded(font, sizePx)));
}
