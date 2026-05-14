import { describe, expect, it } from 'vitest';
import type { CanvasDocument } from './config';
import {
  cloneDocument,
  DEFAULT_DOCUMENT,
  DOCUMENT_SCHEMA_VERSION,
  EFFECT_PRESETS,
  makeEffectLayer,
  makeEmojiLayer,
  makeSourceLayer,
  makeTextLayer,
} from './config';

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
      'scanlines',
      'scanlineWidth',
      'glitch',
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
      'pixelate',
      'hueShift',
      'rgbSplit',
      'vignette',
      'bloom',
      'posterize',
      'filmBurn',
      'duotone',
      'halftone',
      'risoShift',
      'risoAngle',
      'blurAmt',
      'threshold',
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
    expect(layer.scanlines).toBe(0);
    expect(layer.scanlineWidth).toBe(1);
    expect(layer.rgbSplit).toBe(0);
    expect(layer.rays).toBe(0);
    expect(layer.tintOp).toBe(0);
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
    expect(typeof layer.opacity).toBe('number');
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
    expect(layer.scaleX).toBe(1);
    expect(layer.scaleY).toBe(1);
  });
});

describe('cloneDocument', () => {
  it('returns an object deeply equal to the original', () => {
    const original: CanvasDocument = {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      global: { bg: '#120020', seed: 42, aspect: '1:1' },
      layers: [makeEmojiLayer({ id: 'test-emoji' })],
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const cloned = cloneDocument(original);
    expect(cloned).toEqual(original);
  });

  it('does not return the same reference as the original', () => {
    const original: CanvasDocument = {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      global: { bg: '#120020', seed: 42, aspect: '1:1' },
      layers: [makeEmojiLayer({ id: 'test-emoji' })],
      export: { format: 'png', scale: 1, target: 'cover' },
    };
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
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
        colorNodes: [],
        areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['text-1'] }],
      },
    };
    const cloned = cloneDocument(original);
    cloned.graph?.areas?.[0]?.nodeIds.push('other');
    expect(original.graph?.areas?.[0]?.nodeIds).toEqual(['text-1']);
  });
});
