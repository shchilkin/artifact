import { describe, expect, it } from 'vitest';
import type { CanvasDocument } from './config';
import {
  cloneDocument,
  DEFAULT_DOCUMENT,
  DOCUMENT_SCHEMA_VERSION,
  EFFECT_PRESETS,
  FONT_NAMES,
  FONT_OPTIONS,
  FONT_REGISTRY,
  FONT_STACKS,
  GOOGLE_FONT_STYLESHEET_URL,
  makeEffectLayer,
  makeEmojiLayer,
  makeGraphRepeatNode,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from './config';

function cloneableDocument(): CanvasDocument {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    global: { bg: '#120020', seed: 42, aspect: '1:1' },
    layers: [makeEmojiLayer({ id: 'test-emoji' })],
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

describe('makeTextLayer', () => {
  it('returns a layer with kind: text', () => {
    const layer = makeTextLayer();
    expect(layer.kind).toBe('text');
  });

  it('returns all required fields with correct defaults', () => {
    const layer = makeTextLayer();
    expect(typeof layer.id).toBe('string');
    expect(layer.id.length).toBeGreaterThan(0);
    expect(typeof layer.name).toBe('string');
    expect(typeof layer.visible).toBe('boolean');
    expect(typeof layer.locked).toBe('boolean');
    expect(typeof layer.content).toBe('string');
    expect(typeof layer.font).toBe('string');
    expect(typeof layer.size).toBe('number');
    expect(typeof layer.color).toBe('string');
    expect(typeof layer.opacity).toBe('number');
    expect(typeof layer.blendMode).toBe('string');
    expect(typeof layer.x).toBe('number');
    expect(typeof layer.y).toBe('number');
    expect(typeof layer.rotation).toBe('number');
    expect(typeof layer.align).toBe('string');
    expect(typeof layer.scaleX).toBe('number');
    expect(typeof layer.scaleY).toBe('number');
  });

  it('accepts partial overrides', () => {
    const layer = makeTextLayer({ content: 'Hello', size: 72 });
    expect(layer.content).toBe('Hello');
    expect(layer.size).toBe(72);
    expect(layer.kind).toBe('text');
  });

  it('defaults to visible cover text', () => {
    const layer = makeTextLayer();
    expect(layer.content).toBe('TITLE');
    expect(layer.size).toBeGreaterThan(60);
    expect(layer.color).not.toBe('#ffffff');
  });

  it('exposes readable font options for controls', () => {
    expect(FONT_OPTIONS.map((option) => option.value)).toContain('DISPLAY');
    expect(FONT_OPTIONS.map((option) => option.label)).toContain('Display / condensed');
  });

  it('keeps font registry, options, stacks, and stylesheet in sync', () => {
    expect(FONT_NAMES).toContain('ARCHIVO_BLACK');
    expect(FONT_NAMES).toContain('PRESS_START');
    expect(FONT_OPTIONS).toHaveLength(FONT_NAMES.length);
    for (const font of FONT_NAMES) {
      expect(FONT_REGISTRY[font].label).toBeTruthy();
      expect(FONT_STACKS[font]).toContain(FONT_REGISTRY[font].family);
    }
    expect(GOOGLE_FONT_STYLESHEET_URL).toContain('family=Archivo+Black');
    expect(GOOGLE_FONT_STYLESHEET_URL).toContain('family=Press+Start+2P');
    expect(GOOGLE_FONT_STYLESHEET_URL).toContain('display=swap');
  });

  it('generates unique ids for each call', () => {
    const a = makeTextLayer();
    const b = makeTextLayer();
    expect(a.id).not.toBe(b.id);
  });
});

describe('makeEffectLayer', () => {
  it('returns a layer with kind: effect', () => {
    const layer = makeEffectLayer();
    expect(layer.kind).toBe('effect');
  });

  it('returns all required numeric effect fields', () => {
    const layer = makeEffectLayer();
    const numericFields = [
      'grain',
      'dotGrain',
      'dotGrainSize',
      'dotGrainDensity',
      'dotGrainJitter',
      'scanlines',
      'scanlineWidth',
      'glitch',
      'badStream',
      'badStreamBlockSize',
      'badStreamDetail',
      'badStreamSmear',
      'badStreamChroma',
      'badStreamDarkness',
      'tintOp',
      'rays',
      'rayInt',
      'morphAmt',
      'morphFreq',
      'tearAmt',
      'tearSize',
      'noiseWarp',
      'vortex',
      'barrel',
      'mirror',
      'dataMosh',
      'interlace',
      'retroResolution',
      'pixelate',
      'hueShift',
      'rgbSplit',
      'vignette',
      'bloom',
      'posterize',
      'indexedPalette',
      'indexedPaletteCount',
      'filmBurn',
      'duotone',
      'halftone',
      'risoShift',
      'risoAngle',
      'blurAmt',
      'threshold',
      'edgeCrush',
      'silhouetteCrush',
      'edgeDetect',
      'gradMix',
      'gradAngle',
      'sepia',
      'neonGlow',
      'zoomBlur',
      'vhsTracking',
      'dither',
      'infrared',
      'ca',
      'waveAmt',
      'waveFreq',
      'matte',
      'overprint',
      'solarize',
      'bleachBypass',
      'cyanotype',
      'splitToneAmt',
      'rippleAmt',
      'rippleFreq',
      'kaleidoscope',
      'squeezeX',
      'squeezeY',
      'emboss',
      'linocut',
      'fog',
      'speedLines',
      'seedOffset',
    ] as const;

    for (const field of numericFields) {
      expect(typeof layer[field]).toBe('number');
    }
  });

  it('accepts partial overrides', () => {
    const layer = makeEffectLayer({ grain: 99 });
    expect(layer.grain).toBe(99);
    expect(layer.kind).toBe('effect');
  });

  it('defaults to an inert custom effect instead of the old combined FX stack', () => {
    const layer = makeEffectLayer();
    expect(layer.name).toBe('Effect');
    expect(layer.grain).toBe(0);
    expect(layer.dotGrain).toBe(0);
    expect(layer.dotGrainSize).toBe(4);
    expect(layer.scanlines).toBe(0);
    expect(layer.scanlineWidth).toBe(1);
    expect(layer.rgbSplit).toBe(0);
    expect(layer.rays).toBe(0);
    expect(layer.tintOp).toBe(0);
    expect(layer.seedOffset).toBe(0);
  });
});

describe('effect presets', () => {
  it('versions the default document schema', () => {
    expect(DEFAULT_DOCUMENT.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
  });

  it('starts new documents on a transparent canvas', () => {
    expect(DEFAULT_DOCUMENT.global.bg).toBe('transparent');
  });

  it('does not expose legacy combined presets', () => {
    expect(EFFECT_PRESETS).not.toHaveProperty('warp');
    expect(EFFECT_PRESETS).not.toHaveProperty('color');
    expect(EFFECT_PRESETS).not.toHaveProperty('riso');
  });

  it('uses focused effect layers in the default document', () => {
    const effectPresets = DEFAULT_DOCUMENT.layers
      .filter((layer) => layer.kind === 'effect')
      .map((layer) => (layer.kind === 'effect' ? layer.preset : undefined));

    expect(effectPresets).toEqual(['rays', 'tint', 'grain', 'scanlines', 'rgbSplit']);
  });

  it('keeps texture and print preset defaults immediately usable', () => {
    expect(EFFECT_PRESETS.grain.partial.grain).toBe(26);
    expect(EFFECT_PRESETS.dotGrain.partial.dotGrain).toBe(68);
    expect(EFFECT_PRESETS.dotGrain.partial.dotGrainSize).toBe(4);
    expect(EFFECT_PRESETS.dither.partial.dither).toBe(36);
    expect(EFFECT_PRESETS.retroResolution.partial.retroResolution).toBe(320);
    expect(EFFECT_PRESETS.indexedPalette.partial.indexedPalette).toBe(100);
    expect(EFFECT_PRESETS.indexedPalette.partial.indexedPaletteCount).toBe(6);
    expect(EFFECT_PRESETS.edgeCrush.partial.edgeCrush).toBe(55);
    expect(EFFECT_PRESETS.silhouetteCrush.partial.silhouetteCrush).toBe(55);
    expect(EFFECT_PRESETS.pixelate.partial.pixelate).toBe(6);
    expect(EFFECT_PRESETS.risoShift.partial.risoShift).toBe(14);
  });
});

describe('makeImageLayer', () => {
  it('defaults opacity to full strength', () => {
    expect(makeImageLayer('').opacity).toBe(100);
  });
});

describe('makeEmojiLayer', () => {
  it('returns a layer with kind: emoji', () => {
    const layer = makeEmojiLayer();
    expect(layer.kind).toBe('emoji');
  });

  it('returns a non-empty emojis array', () => {
    const layer = makeEmojiLayer();
    expect(Array.isArray(layer.emojis)).toBe(true);
    expect(layer.emojis.length).toBeGreaterThan(0);
  });

  it('returns all required numeric fields', () => {
    const layer = makeEmojiLayer();
    expect(typeof layer.density).toBe('number');
    expect(typeof layer.minSz).toBe('number');
    expect(typeof layer.maxSz).toBe('number');
    expect(typeof layer.blur).toBe('number');
    expect(typeof layer.seedOffset).toBe('number');
    expect(typeof layer.opacity).toBe('number');
  });

  it('defaults to plain emoji scatter without built-in blur effects', () => {
    const layer = makeEmojiLayer();
    expect(layer.blur).toBe(0);
    expect(layer.blendMode).toBe('normal');
  });

  it('accepts partial overrides', () => {
    const layer = makeEmojiLayer({ density: 99, emojis: ['🔥'] });
    expect(layer.density).toBe(99);
    expect(layer.emojis).toEqual(['🔥']);
  });
});

describe('makeSourceLayer', () => {
  it('returns a layer with the requested procedural kind', () => {
    const layer = makeSourceLayer();
    expect(layer.kind).toBe('primitive');
  });

  it('accepts a source subtype and keeps shared transform fields', () => {
    const layer = makeSourceLayer('noise', { noiseScale: 48, x: 0.25 });
    expect(layer.kind).toBe('noise');
    expect(layer.noiseScale).toBe(48);
    expect(layer.x).toBe(0.25);
    expect(layer.seedOffset).toBe(0);
    expect(layer.noiseWarp).toBe(0);
    expect(layer.noiseTurbulence).toBe(0);
    expect(layer.noiseThreshold).toBe(0);
    expect(layer.scaleX).toBe(1);
    expect(layer.scaleY).toBe(1);
  });

  it('creates serializable model source layers', () => {
    const layer = makeSourceLayer('model', {
      modelSrc: 'artifact-model://model-a',
      modelName: 'skull.glb',
      modelBytes: 1024,
    });

    expect(layer.kind).toBe('model');
    if (layer.kind === 'model') {
      expect(layer.modelSrc).toBe('artifact-model://model-a');
      expect(layer.modelName).toBe('skull.glb');
      expect(layer.modelMime).toBe('model/gltf-binary');
      expect(layer.modelBytes).toBe(1024);
    }
    expect(JSON.parse(JSON.stringify(layer))).toMatchObject({ kind: 'model', modelName: 'skull.glb' });
  });
});

describe('makeGraphRepeatNode', () => {
  it('defaults to the document seed without an offset', () => {
    const node = makeGraphRepeatNode();
    expect(node.seedOffset).toBe(0);
  });
});

describe('cloneDocument', () => {
  it('returns an object deeply equal to the original', () => {
    const original = cloneableDocument();
    const cloned = cloneDocument(original);
    expect(cloned).toEqual(original);
  });

  it('does not return the same reference as the original', () => {
    const original = cloneableDocument();
    const cloned = cloneDocument(original);
    expect(cloned).not.toBe(original);
    expect(cloned.global).not.toBe(original.global);
    expect(cloned.layers).not.toBe(original.layers);
  });

  it('deep-clones emoji layer emojis array independently', () => {
    const emojiLayer = makeEmojiLayer({ id: 'e1', emojis: ['😂', '💀'] });
    const original: CanvasDocument = {
      global: { bg: '#120020', seed: 1, aspect: '1:1' },
      layers: [emojiLayer],
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const cloned = cloneDocument(original);
    const clonedEmojiLayer = cloned.layers[0];
    if (clonedEmojiLayer.kind === 'emoji') {
      clonedEmojiLayer.emojis.push('🔥');
    }
    expect(emojiLayer.emojis).toEqual(['😂', '💀']);
  });

  it('deep-clones export settings independently', () => {
    const original: CanvasDocument = {
      global: { bg: '#120020', seed: 1, aspect: '1:1' },
      layers: [makeEffectLayer({ id: 'fx-1' })],
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const cloned = cloneDocument(original);
    cloned.export.scale = 3;
    expect(original.export.scale).toBe(1);
  });

  it('keeps source layer fields when cloning', () => {
    const original: CanvasDocument = {
      global: { bg: '#120020', seed: 1, aspect: '1:1' },
      layers: [makeSourceLayer('array', { id: 'src-1', arrayCount: 9, arrayRows: 3 })],
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const cloned = cloneDocument(original);
    expect(cloned.layers[0]).toEqual(original.layers[0]);
    expect(cloned.layers[0]).not.toBe(original.layers[0]);
  });

  it('deep-clones graph areas independently', () => {
    const original: CanvasDocument = {
      global: { bg: '#120020', seed: 1, aspect: '1:1' },
      layers: [makeTextLayer({ id: 'text-1' })],
      export: { format: 'png', scale: 1, target: 'cover' },
      modelAssets: [
        {
          id: 'model-a',
          dataUrl: 'data:model/gltf-binary;base64,AAAA',
          mime: 'model/gltf-binary',
          bytes: 128,
          label: 'model.glb',
          createdAt: '2026-06-13T00:00:00.000Z',
        },
      ],
      envAssets: [
        {
          id: 'env-a',
          dataUrl: 'data:image/x-exr;base64,CCCC',
          mime: 'image/x-exr',
          bytes: 512,
          label: 'studio.exr',
          createdAt: '2026-06-13T00:00:00.000Z',
        },
      ],
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
        colorNodes: [],
        environmentNodes: [
          {
            id: 'env-node-a',
            name: 'Environment Map',
            environmentSrc: 'artifact-env://env-a',
            environmentName: 'studio.exr',
            environmentMime: 'image/x-exr',
            environmentBytes: 512,
          },
        ],
        areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['text-1'] }],
      },
    };
    const cloned = cloneDocument(original);
    cloned.graph?.areas?.[0]?.nodeIds.push('other');
    cloned.graph?.environmentNodes?.push({
      id: 'env-node-b',
      name: 'Other Environment',
      environmentSrc: 'artifact-env://env-b',
      environmentName: 'other.exr',
      environmentMime: 'image/x-exr',
      environmentBytes: 1024,
    });
    cloned.modelAssets?.push({
      id: 'model-b',
      dataUrl: 'data:model/gltf-binary;base64,BBBB',
      mime: 'model/gltf-binary',
      bytes: 256,
      label: 'other.glb',
      createdAt: '2026-06-13T00:00:00.000Z',
    });
    cloned.envAssets?.push({
      id: 'env-b',
      dataUrl: 'data:image/x-exr;base64,DDDD',
      mime: 'image/x-exr',
      bytes: 1024,
      label: 'other.exr',
      createdAt: '2026-06-13T00:00:00.000Z',
    });
    expect(original.graph?.areas?.[0]?.nodeIds).toEqual(['text-1']);
    expect(original.graph?.environmentNodes).toHaveLength(1);
    expect(original.modelAssets).toHaveLength(1);
    expect(original.envAssets).toHaveLength(1);
  });
});
