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

export const LAYER_STARTER_DOCUMENTS: StarterDocument[] = [TEXTURE_TYPE_STACK_STARTER];

export function getStarterDocument(id: string): StarterDocument | undefined {
  return LAYER_STARTER_DOCUMENTS.find((starter) => starter.id === id);
}
