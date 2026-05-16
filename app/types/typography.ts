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

export const FONT_STACKS: Record<FontName, string> = {
  MONO: '"Courier New", monospace',
  DISPLAY: '"Barlow Condensed", "Arial Black", sans-serif',
  ANTON: '"Anton", "Arial Black", sans-serif',
  BEBAS: '"Bebas Neue", "Arial Narrow", sans-serif',
  RUBIK_MONO: '"Rubik Mono One", "Arial Black", sans-serif',
  VT323: '"VT323", monospace',
  SPECIAL: '"Special Elite", "Courier New", monospace',
};
