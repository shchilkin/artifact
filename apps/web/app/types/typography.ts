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

export const FONT_NAMES = ['MONO', 'DISPLAY', 'ANTON', 'BEBAS', 'RUBIK_MONO', 'VT323', 'SPECIAL'] as const;

export type FontName = (typeof FONT_NAMES)[number];

export const FONT_LABELS: Record<FontName, string> = {
  MONO: 'Mono / utility',
  DISPLAY: 'Display / condensed',
  ANTON: 'Anton / heavy poster',
  BEBAS: 'Bebas / tall title',
  RUBIK_MONO: 'Rubik Mono / block',
  VT323: 'VT323 / pixel terminal',
  SPECIAL: 'Special Elite / typewriter',
};

export const FONT_OPTIONS = FONT_NAMES.map((font) => ({ value: font, label: FONT_LABELS[font] }));

export const FONT_STACKS: Record<FontName, string> = {
  MONO: '"Courier New", monospace',
  DISPLAY: '"Barlow Condensed", "Arial Black", sans-serif',
  ANTON: '"Anton", "Arial Black", sans-serif',
  BEBAS: '"Bebas Neue", "Arial Narrow", sans-serif',
  RUBIK_MONO: '"Rubik Mono One", "Arial Black", sans-serif',
  VT323: '"VT323", monospace',
  SPECIAL: '"Special Elite", "Courier New", monospace',
};
