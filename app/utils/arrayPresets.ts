import type { ArrayLayer } from '../types/config';
import { makeSourceLayer } from '../types/config';

export const ARRAY_PRESET_IDS = ['stickerGrid', 'radialBurst', 'barcodeLine', 'orbitRings', 'shardField'] as const;
export type ArrayPresetId = (typeof ARRAY_PRESET_IDS)[number];

type ArrayPresetPatch = Partial<Omit<ArrayLayer, 'kind' | 'id'>>;

export interface ArrayPreset {
  id: ArrayPresetId;
  name: string;
  description: string;
  patch: ArrayPresetPatch;
}

export const ARRAY_PRESETS: Record<ArrayPresetId, ArrayPreset> = {
  stickerGrid: {
    id: 'stickerGrid',
    name: 'Sticker Grid',
    description: 'Regular disc grid for labels, pop sheets, and repeated marks.',
    patch: {
      name: 'Sticker Grid',
      arrayPattern: 'grid',
      arrayShape: 'disc',
      arrayCount: 7,
      arrayRows: 7,
      arrayGap: 34,
      arraySize: 18,
      arrayJitter: 2,
      color: '#ff6a3a',
      accentColor: '#f6e6c8',
      opacity: 100,
    },
  },
  radialBurst: {
    id: 'radialBurst',
    name: 'Radial Burst',
    description: 'Diamond spokes for energetic halos and center-focused covers.',
    patch: {
      name: 'Radial Burst',
      arrayPattern: 'radial',
      arrayShape: 'diamond',
      arrayCount: 18,
      arrayRows: 3,
      arrayRadius: 64,
      arrayGap: 42,
      arraySize: 16,
      arrayJitter: 6,
      color: '#f5d56b',
      accentColor: '#ff4f8b',
      opacity: 100,
      blendMode: 'screen',
    },
  },
  barcodeLine: {
    id: 'barcodeLine',
    name: 'Barcode Line',
    description: 'Uneven vertical bars for scanner texture and graphic dividers.',
    patch: {
      name: 'Barcode Line',
      arrayPattern: 'line',
      arrayShape: 'bar',
      arrayCount: 28,
      arrayRows: 1,
      arrayGap: 11,
      arrayRadius: 8,
      arraySize: 86,
      arrayJitter: 8,
      color: '#f4f0e8',
      accentColor: '#ff5a36',
      opacity: 92,
    },
  },
  orbitRings: {
    id: 'orbitRings',
    name: 'Orbit Rings',
    description: 'Disc rings for constellation layouts, bubbles, and circular rhythm.',
    patch: {
      name: 'Orbit Rings',
      arrayPattern: 'radial',
      arrayShape: 'disc',
      arrayCount: 12,
      arrayRows: 4,
      arrayRadius: 30,
      arrayGap: 38,
      arraySize: 12,
      arrayJitter: 10,
      color: '#68ffd8',
      accentColor: '#8b5cff',
      opacity: 88,
      blendMode: 'screen',
    },
  },
  shardField: {
    id: 'shardField',
    name: 'Shard Field',
    description: 'Jittered diamond grid for broken glass, confetti, and noisy structure.',
    patch: {
      name: 'Shard Field',
      arrayPattern: 'grid',
      arrayShape: 'diamond',
      arrayCount: 12,
      arrayRows: 9,
      arrayGap: 30,
      arraySize: 12,
      arrayJitter: 22,
      color: '#ffffff',
      accentColor: '#ff6a3a',
      opacity: 80,
      blendMode: 'screen',
    },
  },
};

export function makeArrayPresetLayer(presetId: ArrayPresetId): ArrayLayer {
  const preset = ARRAY_PRESETS[presetId];
  return makeSourceLayer('array', preset.patch) as ArrayLayer;
}
