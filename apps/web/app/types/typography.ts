export const ALL_EMOJIS = [
  '😂',
  '😭',
  '😢',
  '😞',
  '😤',
  '😮',
  '😩',
  '😑',
  '💔',
  '👽',
  '💀',
  '✦',
  '🤡',
  '🖤',
  '💜',
  '🔥',
  '⚡',
  '🌑',
  '🥀',
  '😈',
];

type FontCategory = 'Utility' | 'Poster' | 'Condensed' | 'Mono' | 'Pixel' | 'Typewriter';

interface FontRegistryItem {
  label: string;
  category: FontCategory;
  family: string;
  stack: string;
  googleFamily?: string;
  weights?: readonly number[];
  sample: string;
}

export const FONT_REGISTRY = {
  MONO: {
    label: 'Mono / utility',
    category: 'Utility',
    family: 'Courier New',
    stack: '"Courier New", monospace',
    sample: 'TRACK 04',
  },
  DISPLAY: {
    label: 'Display / condensed',
    category: 'Condensed',
    family: 'Barlow Condensed',
    stack: '"Barlow Condensed", "Arial Black", sans-serif',
    googleFamily: 'Barlow Condensed',
    weights: [700, 900],
    sample: 'POSTER',
  },
  ANTON: {
    label: 'Anton / heavy poster',
    category: 'Poster',
    family: 'Anton',
    stack: '"Anton", "Arial Black", sans-serif',
    googleFamily: 'Anton',
    sample: 'TITLE',
  },
  BEBAS: {
    label: 'Bebas / tall title',
    category: 'Condensed',
    family: 'Bebas Neue',
    stack: '"Bebas Neue", "Arial Narrow", sans-serif',
    googleFamily: 'Bebas Neue',
    sample: 'LOUD',
  },
  RUBIK_MONO: {
    label: 'Rubik Mono / block',
    category: 'Poster',
    family: 'Rubik Mono One',
    stack: '"Rubik Mono One", "Arial Black", sans-serif',
    googleFamily: 'Rubik Mono One',
    sample: 'BLOCK',
  },
  VT323: {
    label: 'VT323 / pixel terminal',
    category: 'Pixel',
    family: 'VT323',
    stack: '"VT323", monospace',
    googleFamily: 'VT323',
    sample: 'CRT-01',
  },
  SPECIAL: {
    label: 'Special Elite / typewriter',
    category: 'Typewriter',
    family: 'Special Elite',
    stack: '"Special Elite", "Courier New", monospace',
    googleFamily: 'Special Elite',
    sample: 'XEROX',
  },
  ARCHIVO_BLACK: {
    label: 'Archivo Black / dense cover',
    category: 'Poster',
    family: 'Archivo Black',
    stack: '"Archivo Black", "Arial Black", sans-serif',
    googleFamily: 'Archivo Black',
    sample: 'COVER',
  },
  BUNGEE: {
    label: 'Bungee / sign painter',
    category: 'Poster',
    family: 'Bungee',
    stack: '"Bungee", "Arial Black", sans-serif',
    googleFamily: 'Bungee',
    sample: 'SIGN',
  },
  STAATLICHES: {
    label: 'Staatliches / narrow poster',
    category: 'Condensed',
    family: 'Staatliches',
    stack: '"Staatliches", "Arial Narrow", sans-serif',
    googleFamily: 'Staatliches',
    sample: 'NIGHT',
  },
  SPACE_MONO: {
    label: 'Space Mono / clean mono',
    category: 'Mono',
    family: 'Space Mono',
    stack: '"Space Mono", "Courier New", monospace',
    googleFamily: 'Space Mono',
    weights: [400, 700],
    sample: 'A/B 120',
  },
  PRESS_START: {
    label: 'Press Start / arcade pixel',
    category: 'Pixel',
    family: 'Press Start 2P',
    stack: '"Press Start 2P", "VT323", monospace',
    googleFamily: 'Press Start 2P',
    sample: '8 BIT',
  },
} as const satisfies Record<string, FontRegistryItem>;

export type FontName = keyof typeof FONT_REGISTRY;
export type ImportedFontRef = `artifact-font://${string}`;
export type TextFontRef = FontName | ImportedFontRef | (string & {});

export const FONT_NAMES = Object.keys(FONT_REGISTRY) as FontName[];

export const FONT_STACKS: Record<FontName, string> = Object.fromEntries(
  FONT_NAMES.map((font) => [font, FONT_REGISTRY[font].stack]),
) as Record<FontName, string>;

export const FONT_OPTIONS = FONT_NAMES.map((font) => ({
  value: font,
  label: FONT_REGISTRY[font].label,
}));

export function isBundledFontName(font: string): font is FontName {
  return font in FONT_REGISTRY;
}

export function getBundledFontRegistryItem(font: TextFontRef): FontRegistryItem {
  return isBundledFontName(font) ? FONT_REGISTRY[font] : FONT_REGISTRY.MONO;
}

export function getBundledFontStack(font: TextFontRef): string {
  return isBundledFontName(font) ? FONT_STACKS[font] : FONT_STACKS.MONO;
}

function googleFamilyParam(font: FontRegistryItem): string | null {
  if (!font.googleFamily) return null;
  const family = font.googleFamily.replaceAll(' ', '+');
  if (!font.weights?.length) return `family=${family}`;
  return `family=${family}:wght@${font.weights.join(';')}`;
}

export const GOOGLE_FONT_STYLESHEET_URL = `https://fonts.googleapis.com/css2?${FONT_NAMES.map((font) =>
  googleFamilyParam(FONT_REGISTRY[font]),
)
  .filter(Boolean)
  .join('&')}&display=swap`;
