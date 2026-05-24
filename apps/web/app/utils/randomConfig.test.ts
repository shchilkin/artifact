import { describe, expect, it } from 'vitest';
import { DOCUMENT_SCHEMA_VERSION, EFFECT_PRESETS, makeEffectPresetLayer } from '../types/config';
import {
  randomDocument,
  randomEffectLayer,
  randomEmojiLayer,
  randomGlobal,
  randomLayerSection,
  zeroLayerSection,
} from './randomConfig';

describe('randomGlobal', () => {
  it('returns a valid GlobalConfig with hex bg and numeric seed in [0, 999999]', () => {
    const config = randomGlobal();
    expect(config).toHaveProperty('bg');
    expect(config).toHaveProperty('seed');
    expect(typeof config.bg).toBe('string');
    expect(config.bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(typeof config.seed).toBe('number');
    expect(config.seed).toBeGreaterThanOrEqual(0);
    expect(config.seed).toBeLessThanOrEqual(999999);
  });

  it('accepts an optional baseHue and still returns valid config', () => {
    const config = randomGlobal(180);
    expect(config.bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(config.seed).toBeGreaterThanOrEqual(0);
    expect(config.seed).toBeLessThanOrEqual(999999);
  });
});

describe('randomEmojiLayer', () => {
  it('returns a layer with kind: emoji', () => {
    const layer = randomEmojiLayer();
    expect(layer.kind).toBe('emoji');
  });

  it('returns a non-empty emojis array', () => {
    const layer = randomEmojiLayer();
    expect(Array.isArray(layer.emojis)).toBe(true);
    expect(layer.emojis.length).toBeGreaterThan(0);
  });

  it('returns numeric density in [15, 70]', () => {
    const layer = randomEmojiLayer();
    expect(typeof layer.density).toBe('number');
    expect(layer.density).toBeGreaterThanOrEqual(15);
    expect(layer.density).toBeLessThanOrEqual(70);
  });

  it('returns numeric minSz in [10, 50]', () => {
    const layer = randomEmojiLayer();
    expect(typeof layer.minSz).toBe('number');
    expect(layer.minSz).toBeGreaterThanOrEqual(10);
    expect(layer.minSz).toBeLessThanOrEqual(50);
  });

  it('returns numeric maxSz greater than minSz', () => {
    const layer = randomEmojiLayer();
    expect(typeof layer.maxSz).toBe('number');
    expect(layer.maxSz).toBeGreaterThan(layer.minSz);
  });

  it('returns numeric blur in [0, 80]', () => {
    const layer = randomEmojiLayer();
    expect(typeof layer.blur).toBe('number');
    expect(layer.blur).toBeGreaterThanOrEqual(0);
    expect(layer.blur).toBeLessThanOrEqual(80);
  });
});

describe('randomEffectLayer', () => {
  it('returns a layer with kind: effect', () => {
    const layer = randomEffectLayer();
    expect(layer.kind).toBe('effect');
  });

  it('returns all numeric fields >= 0', () => {
    const layer = randomEffectLayer();
    const numericFields = [
      'grain',
      'scanlines',
      'scanlineWidth',
      'rgbSplit',
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
    ] as const;

    for (const field of numericFields) {
      expect(typeof layer[field]).toBe('number');
      expect(layer[field]).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns string color fields as hex strings', () => {
    const layer = randomEffectLayer();
    expect(layer.tint).toMatch(/^#[0-9a-f]{6}$/i);
    expect(layer.rayColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(layer.duoA).toMatch(/^#[0-9a-f]{6}$/i);
    expect(layer.duoB).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('accepts an optional baseHue parameter', () => {
    const layer = randomEffectLayer(90);
    expect(layer.kind).toBe('effect');
  });

  it('returns one focused preset instead of a combined FX layer', () => {
    const layer = randomEffectLayer();
    expect(layer.preset).toBeDefined();
    expect(layer.preset && layer.preset in EFFECT_PRESETS).toBe(true);
    expect(layer.preset).not.toBe('warp');
    expect(layer.preset).not.toBe('color');
    expect(layer.preset).not.toBe('riso');
  });
});

describe('randomDocument', () => {
  it('returns a CanvasDocument with global and layers', () => {
    const doc = randomDocument();
    expect(doc.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
    expect(doc).toHaveProperty('global');
    expect(doc).toHaveProperty('layers');
  });

  it('global has bg, seed, and aspect', () => {
    const doc = randomDocument();
    expect(doc.global).toHaveProperty('bg');
    expect(doc.global).toHaveProperty('seed');
    expect(doc.global).toHaveProperty('aspect');
  });

  it('layers is a non-empty array with at least one layer', () => {
    const doc = randomDocument();
    expect(Array.isArray(doc.layers)).toBe(true);
    expect(doc.layers.length).toBeGreaterThanOrEqual(1);
  });

  it('first layer is an emoji layer', () => {
    const doc = randomDocument();
    expect(doc.layers[0].kind).toBe('emoji');
  });

  it('generates only focused effect preset layers after the emoji layer', () => {
    const doc = randomDocument();
    const effectLayers = doc.layers.slice(1);

    expect(
      effectLayers.every((layer) => layer.kind === 'effect' && layer.preset && layer.preset in EFFECT_PRESETS),
    ).toBe(true);
  });
});

describe('zeroLayerSection', () => {
  it('RAYS returns rays: 0, rayInt: 0, bloom: 0, filmBurn: 0', () => {
    const result = zeroLayerSection('RAYS');
    expect(result).toMatchObject({ rays: 0, rayInt: 0, bloom: 0, filmBurn: 0 });
  });

  it('GLITCH returns glitch: 0 and rgbSplit: 0', () => {
    const result = zeroLayerSection('GLITCH');
    expect(result).toMatchObject({ glitch: 0, rgbSplit: 0 });
  });

  it('WARP returns morph/tear/noise/vortex/barrel/mirror all as 0', () => {
    const result = zeroLayerSection('WARP');
    expect(result).toMatchObject({
      morphAmt: 0,
      tearAmt: 0,
      noiseWarp: 0,
      vortex: 0,
      barrel: 0,
      mirror: 0,
    });
  });

  it('unknown section returns empty object', () => {
    const result = zeroLayerSection('UNKNOWN');
    expect(result).toEqual({});
  });
});

describe('randomLayerSection', () => {
  it('keeps texture and print randomization inside useful creative ranges', () => {
    const grainLayer = makeEffectPresetLayer('grain');
    const pixelLayer = makeEffectPresetLayer('pixelate');
    const risoLayer = makeEffectPresetLayer('risoShift');

    for (let i = 0; i < 50; i += 1) {
      const texture = randomLayerSection(grainLayer, 'TEXTURE');
      const color = randomLayerSection(pixelLayer, 'COLORFX');
      const riso = randomLayerSection(risoLayer, 'RISO');

      expect(texture.grain).toBeGreaterThanOrEqual(0);
      expect(texture.grain).toBeLessThanOrEqual(42);
      expect(texture.dither).toBeGreaterThanOrEqual(0);
      expect(texture.dither).toBeLessThanOrEqual(50);
      expect(color.pixelate).toBeGreaterThanOrEqual(0);
      expect(color.pixelate).toBeLessThanOrEqual(10);
      expect(riso.risoShift).toBeGreaterThanOrEqual(0);
      expect(riso.risoShift).toBeLessThanOrEqual(18);
    }
  });
});
