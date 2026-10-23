import { existsSync } from 'node:fs';
import { GlobalFonts } from '@napi-rs/canvas';
import { FONT_REGISTRY } from '../../../types/typography';

// The editor's fonts load from Google Fonts, which Node does not have, so every text layer falls back to a system
// font. Which fallback Skia picks depends on how the container enumerates its fonts, and that differed between a
// local Docker run and CI. Golden pixel runs therefore pin every family in the font stacks, and the emoji font, to
// fonts that ship in the pinned Playwright image.

const FONT_DIR = '/usr/share/fonts/truetype/';
const GENERIC_FILES: Record<string, string[]> = {
  'sans-serif': ['liberation/LiberationSans-Regular.ttf', 'liberation/LiberationSans-Bold.ttf'],
  serif: ['liberation/LiberationSerif-Regular.ttf', 'liberation/LiberationSerif-Bold.ttf'],
  monospace: ['liberation/LiberationMono-Regular.ttf', 'liberation/LiberationMono-Bold.ttf'],
};
const EMOJI_FILE = 'noto/NotoColorEmoji.ttf';

function stackFamilies(stack: string): string[] {
  return stack.split(',').map((family) => family.trim().replace(/^["']|["']$/g, ''));
}

/** Pins font fallback for golden pixel runs. Returns false outside the Playwright image, where pixels are not checked. */
export function pinGoldenFonts(): boolean {
  if (!existsSync(`${FONT_DIR}${GENERIC_FILES['sans-serif'][0]}`)) return false;
  for (const [generic, files] of Object.entries(GENERIC_FILES)) {
    for (const file of files) GlobalFonts.registerFromPath(`${FONT_DIR}${file}`, `golden-${generic}`);
    GlobalFonts.setAlias(`golden-${generic}`, generic);
  }
  for (const { stack } of Object.values(FONT_REGISTRY)) {
    const families = stackFamilies(stack);
    const generic = families.at(-1) ?? 'sans-serif';
    const pinned = GENERIC_FILES[generic] ? `golden-${generic}` : 'golden-sans-serif';
    for (const family of families.slice(0, -1)) GlobalFonts.setAlias(pinned, family);
  }
  GlobalFonts.registerFromPath(`${FONT_DIR}${EMOJI_FILE}`, 'Noto Color Emoji');
  for (const family of ['Apple Color Emoji', 'Segoe UI Emoji']) GlobalFonts.setAlias('Noto Color Emoji', family);
  return true;
}
