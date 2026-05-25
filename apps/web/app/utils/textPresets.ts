import { makeTextLayer, type TextLayer } from '../types/config';

export const TEXT_PRESET_IDS = ['title', 'subtitle', 'label', 'credit', 'poster'] as const;
export type TextPresetId = (typeof TEXT_PRESET_IDS)[number];

export interface TextPresetDefinition {
  name: string;
  description: string;
  tags: readonly string[];
  keywords: string;
  partial: Partial<TextLayer>;
  popular?: boolean;
}

export const TEXT_PRESETS: Record<TextPresetId, TextPresetDefinition> = {
  title: {
    name: 'Title Type',
    description: 'Large centered cover title with condensed poster weight.',
    tags: ['type', 'title'],
    keywords: 'text type title headline album cover poster typography',
    popular: true,
    partial: {
      name: 'Title Type',
      content: 'TITLE',
      font: 'DISPLAY',
      size: 92,
      color: '#f5ead8',
      x: 0.5,
      y: 0.48,
      rotation: -3,
      align: 'center',
      scaleX: 1.06,
      scaleY: 0.94,
    },
  },
  subtitle: {
    name: 'Subtitle',
    description: 'Small supporting line for artist names, editions, or dates.',
    tags: ['type', 'subtitle'],
    keywords: 'text type subtitle artist date small line caption',
    partial: {
      name: 'Subtitle',
      content: 'SUBTITLE',
      font: 'MONO',
      size: 24,
      color: '#e9d9c3',
      x: 0.5,
      y: 0.63,
      rotation: 0,
      align: 'center',
      scaleX: 1,
      scaleY: 1,
    },
  },
  label: {
    name: 'Label Type',
    description: 'Compact stamped text for corners, stickers, and issue marks.',
    tags: ['type', 'label'],
    keywords: 'text type label sticker corner stamp tag issue badge',
    partial: {
      name: 'Label Type',
      content: 'LABEL',
      font: 'SPECIAL',
      size: 30,
      color: '#f46f5e',
      x: 0.24,
      y: 0.78,
      rotation: -7,
      align: 'center',
      scaleX: 1,
      scaleY: 1,
    },
  },
  credit: {
    name: 'Credits',
    description: 'Tiny cover credits for track notes, venues, and catalog IDs.',
    tags: ['type', 'credit'],
    keywords: 'text type credit caption notes catalog small footer artist',
    partial: {
      name: 'Credits',
      content: 'ARTIST\nTRACK',
      font: 'MONO',
      size: 18,
      color: '#d8c6ae',
      x: 0.5,
      y: 0.86,
      rotation: 0,
      align: 'center',
      scaleX: 1,
      scaleY: 1,
    },
  },
  poster: {
    name: 'Poster Type',
    description: 'Oversized type block for loud typographic cover starts.',
    tags: ['type', 'poster'],
    keywords: 'text type poster huge bold big typography headline',
    popular: true,
    partial: {
      name: 'Poster Type',
      content: 'POSTER',
      font: 'ANTON',
      size: 118,
      color: '#f5ead8',
      x: 0.5,
      y: 0.53,
      rotation: -2,
      align: 'center',
      scaleX: 0.96,
      scaleY: 0.88,
    },
  },
};

export function makeTextPresetLayer(preset: TextPresetId, partial: Partial<TextLayer> = {}) {
  return makeTextLayer({
    ...TEXT_PRESETS[preset].partial,
    ...partial,
  });
}
