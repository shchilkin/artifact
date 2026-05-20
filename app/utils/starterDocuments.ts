import {
  type CanvasDocument,
  DEFAULT_EXPORT,
  makeEffectPresetLayer,
  makeFillLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';

export interface StarterDocument {
  id: string;
  name: string;
  shortName: string;
  description: string;
  doc: CanvasDocument;
}

export const TEXTURE_TYPE_STACK_STARTER: StarterDocument = {
  id: 'layer-starter-texture-type',
  name: 'Texture Type Stack',
  shortName: 'Texture Type',
  description: 'A stack-only cover: fill, procedural texture, type, scanlines, and grain.',
  doc: {
    global: { bg: '#080407', seed: 87017, aspect: '1:1' },
    export: { ...DEFAULT_EXPORT },
    layers: [
      makeFillLayer({ id: 'starter-plate', name: 'ink plate', color: '#12051a' }),
      makeSourceLayer('noise', {
        id: 'starter-clouds',
        name: 'paper clouds',
        noiseType: 'clouds',
        noiseScale: 18,
        noiseDetail: 6,
        noiseContrast: 64,
        noiseBalance: 44,
        noiseWarp: 28,
        noiseTurbulence: 22,
        color: '#361423',
        accentColor: '#f06b4e',
        opacity: 88,
        blendMode: 'screen',
      }),
      makeTextLayer({
        id: 'starter-title',
        name: 'title',
        content: 'NOISE\nTYPE',
        font: 'DISPLAY',
        size: 132,
        color: '#f5ead8',
        x: 0.5,
        y: 0.53,
        rotation: -4,
        scaleX: 1.1,
        scaleY: 0.95,
      }),
      {
        ...makeEffectPresetLayer('risoShift', { value: 14 }),
        id: 'starter-registration',
        name: 'loose registration',
        risoAngle: 18,
      },
      {
        ...makeEffectPresetLayer('scanlines', { value: 12 }),
        id: 'starter-scanlines',
        name: 'print lines',
        scanlineWidth: 2,
      },
      {
        ...makeEffectPresetLayer('grain', { value: 18 }),
        id: 'starter-grain',
        name: 'paper tooth',
      },
    ],
  },
};

export const SIGNAL_POSTER_STACK_STARTER: StarterDocument = {
  id: 'layer-starter-signal-poster',
  name: 'Signal Poster Stack',
  shortName: 'Signal Poster',
  description: 'A stack-only poster cover: dark plate, static field, array burst, compact type, glow, and vignette.',
  doc: {
    global: { bg: '#050407', seed: 91033, aspect: '4:5' },
    export: { ...DEFAULT_EXPORT },
    layers: [
      makeFillLayer({ id: 'signal-plate', name: 'signal plate', color: '#070509' }),
      makeSourceLayer('noise', {
        id: 'signal-static',
        name: 'low signal',
        noiseType: 'cells',
        noiseScale: 42,
        noiseDetail: 5,
        noiseContrast: 72,
        noiseBalance: 38,
        noiseThreshold: 18,
        color: '#160b1d',
        accentColor: '#f0523b',
        opacity: 72,
        blendMode: 'screen',
      }),
      makeSourceLayer('array', {
        id: 'signal-burst',
        name: 'center burst',
        arrayPattern: 'radial',
        arrayShape: 'bar',
        arrayCount: 12,
        arrayRows: 2,
        arrayRadius: 138,
        arrayGap: 24,
        arraySize: 18,
        arrayJitter: 10,
        color: '#f2d49b',
        accentColor: '#f0523b',
        opacity: 78,
        blendMode: 'screen',
      }),
      makeTextLayer({
        id: 'signal-title',
        name: 'center type',
        content: 'NO\nCARRIER',
        font: 'BEBAS',
        size: 112,
        color: '#f7e2c2',
        x: 0.5,
        y: 0.53,
        rotation: 0,
        scaleX: 1.05,
        scaleY: 1,
      }),
      {
        ...makeEffectPresetLayer('neonGlow', { value: 16 }),
        id: 'signal-glow',
        name: 'tube glow',
        neonColor: '#f0523b',
      },
      {
        ...makeEffectPresetLayer('vignette', { value: 42 }),
        id: 'signal-edge',
        name: 'edge falloff',
      },
      {
        ...makeEffectPresetLayer('grain', { value: 14 }),
        id: 'signal-grain',
        name: 'print grain',
      },
    ],
  },
};

export const LAYER_STARTER_DOCUMENTS: StarterDocument[] = [TEXTURE_TYPE_STACK_STARTER, SIGNAL_POSTER_STACK_STARTER];

export function getStarterDocument(id: string): StarterDocument | undefined {
  return LAYER_STARTER_DOCUMENTS.find((starter) => starter.id === id);
}
