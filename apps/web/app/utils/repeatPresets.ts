import type { GraphRepeatNode } from '../types/config';
import { makeGraphRepeatNode } from '../types/config';

export const REPEAT_PRESET_IDS = ['stickerGrid', 'echoTrail', 'orbitRings', 'typeCascade', 'burstField'] as const;
export type RepeatPresetId = (typeof REPEAT_PRESET_IDS)[number];

type RepeatPresetPatch = Partial<Omit<GraphRepeatNode, 'id'>>;

export interface RepeatPreset {
  id: RepeatPresetId;
  name: string;
  description: string;
  patch: RepeatPresetPatch;
}

export const REPEAT_PRESETS: Record<RepeatPresetId, RepeatPreset> = {
  stickerGrid: {
    id: 'stickerGrid',
    name: 'Sticker Grid',
    description: 'Tiles a source branch into a readable poster wall or label sheet.',
    patch: {
      name: 'Sticker Grid',
      pattern: 'grid',
      count: 5,
      rows: 4,
      gap: 104,
      radius: 80,
      scale: 22,
      jitter: 4,
      rotation: 0,
      opacity: 100,
      blendMode: 'source-over',
    },
  },
  echoTrail: {
    id: 'echoTrail',
    name: 'Echo Trail',
    description: 'Offsets a motif into a fading motion trail for titles, logos, and cutouts.',
    patch: {
      name: 'Echo Trail',
      pattern: 'line',
      count: 9,
      rows: 1,
      gap: 46,
      radius: 80,
      scale: 32,
      jitter: 3,
      rotation: -10,
      opacity: 76,
      blendMode: 'screen',
    },
  },
  orbitRings: {
    id: 'orbitRings',
    name: 'Orbit Rings',
    description: 'Builds circular constellations around a focal point from any upstream branch.',
    patch: {
      name: 'Orbit Rings',
      pattern: 'radial',
      count: 12,
      rows: 3,
      gap: 48,
      radius: 34,
      scale: 16,
      jitter: 10,
      rotation: 0,
      opacity: 88,
      blendMode: 'screen',
    },
  },
  typeCascade: {
    id: 'typeCascade',
    name: 'Type Cascade',
    description: 'Stacks repeated text or symbols into a dense typographic texture.',
    patch: {
      name: 'Type Cascade',
      pattern: 'grid',
      count: 4,
      rows: 6,
      gap: 76,
      radius: 80,
      scale: 18,
      jitter: 8,
      rotation: -5,
      opacity: 84,
      blendMode: 'source-over',
    },
  },
  burstField: {
    id: 'burstField',
    name: 'Burst Field',
    description: 'Scatters repeated motifs into a center-focused explosion or confetti cluster.',
    patch: {
      name: 'Burst Field',
      pattern: 'radial',
      count: 22,
      rows: 2,
      gap: 34,
      radius: 24,
      scale: 14,
      jitter: 28,
      rotation: 0,
      opacity: 92,
      blendMode: 'screen',
    },
  },
};

export function makeRepeatPresetNode(presetId: RepeatPresetId): GraphRepeatNode {
  const preset = REPEAT_PRESETS[presetId];
  return makeGraphRepeatNode(preset.patch);
}
