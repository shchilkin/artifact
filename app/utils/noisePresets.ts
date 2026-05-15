import type { NoiseLayer } from '../types/config';
import { makeSourceLayer } from '../types/config';

export const NOISE_PRESET_IDS = ['concrete', 'filmGrain', 'static', 'cells', 'clouds', 'paper', 'crtDirt'] as const;
export type NoisePresetId = (typeof NOISE_PRESET_IDS)[number];

type NoisePresetPatch = Partial<Omit<NoiseLayer, 'kind' | 'id'>>;

export interface NoisePreset {
  id: NoisePresetId;
  name: string;
  description: string;
  patch: NoisePresetPatch;
}

export const NOISE_PRESETS: Record<NoisePresetId, NoisePreset> = {
  concrete: {
    id: 'concrete',
    name: 'Concrete Noise',
    description: 'High contrast cells for walls, asphalt, and photocopy texture.',
    patch: {
      name: 'Concrete Noise',
      noiseType: 'cells',
      noiseScale: 18,
      noiseDetail: 5,
      noiseContrast: 78,
      noiseBalance: 44,
      noiseWarp: 18,
      noiseTurbulence: 34,
      noiseThreshold: 18,
      color: '#0c0b0a',
      accentColor: '#b8afa5',
      opacity: 100,
    },
  },
  filmGrain: {
    id: 'filmGrain',
    name: 'Film Grain',
    description: 'Fine monochrome grain for finishing and subtle surface breakup.',
    patch: {
      name: 'Film Grain',
      noiseType: 'value',
      noiseScale: 6,
      noiseDetail: 2,
      noiseContrast: 58,
      noiseBalance: 50,
      noiseTurbulence: 16,
      color: '#1a1716',
      accentColor: '#d9d1c8',
      opacity: 42,
      blendMode: 'overlay',
    },
  },
  static: {
    id: 'static',
    name: 'Static',
    description: 'Hard signal snow for damaged media and broadcast texture.',
    patch: {
      name: 'Static',
      noiseType: 'value',
      noiseScale: 3,
      noiseDetail: 1,
      noiseContrast: 92,
      noiseBalance: 50,
      noiseThreshold: 38,
      color: '#050505',
      accentColor: '#f1f1e8',
      opacity: 100,
    },
  },
  cells: {
    id: 'cells',
    name: 'Cells',
    description: 'Chunky organic islands for masks, bubbles, and rocky fields.',
    patch: {
      name: 'Cells',
      noiseType: 'cells',
      noiseScale: 34,
      noiseDetail: 4,
      noiseContrast: 64,
      noiseBalance: 52,
      noiseWarp: 12,
      noiseTurbulence: 24,
      color: '#150917',
      accentColor: '#ff684d',
      opacity: 100,
    },
  },
  clouds: {
    id: 'clouds',
    name: 'Clouds',
    description: 'Soft layered noise for smoke, gradients, and atmospheric masks.',
    patch: {
      name: 'Clouds',
      noiseType: 'clouds',
      noiseScale: 44,
      noiseDetail: 6,
      noiseContrast: 48,
      noiseBalance: 56,
      noiseWarp: 36,
      color: '#11101a',
      accentColor: '#7dd3fc',
      opacity: 92,
    },
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    description: 'Warm low-contrast fiber for print, zines, and scanned artwork.',
    patch: {
      name: 'Paper',
      noiseType: 'clouds',
      noiseScale: 14,
      noiseDetail: 7,
      noiseContrast: 24,
      noiseBalance: 62,
      noiseWarp: 8,
      noiseTurbulence: 12,
      color: '#201814',
      accentColor: '#f4dfbd',
      opacity: 62,
      blendMode: 'screen',
    },
  },
  crtDirt: {
    id: 'crtDirt',
    name: 'CRT Dirt',
    description: 'Dark uneven grit that pairs well with scanlines and RGB split.',
    patch: {
      name: 'CRT Dirt',
      noiseType: 'clouds',
      noiseScale: 8,
      noiseDetail: 5,
      noiseContrast: 70,
      noiseBalance: 35,
      noiseWarp: 22,
      noiseThreshold: 24,
      color: '#020204',
      accentColor: '#8e949b',
      opacity: 58,
      blendMode: 'multiply',
    },
  },
};

export function makeNoisePresetLayer(presetId: NoisePresetId): NoiseLayer {
  const preset = NOISE_PRESETS[presetId];
  return makeSourceLayer('noise', preset.patch) as NoiseLayer;
}
