import { describe, expect, it } from 'vitest';
import { DOCUMENT_SCHEMA_VERSION, EFFECT_PRESETS } from '../types/config';
import {
  RANDOM_FORMULA_IDS,
  randomDocument,
  randomDocumentForFormula,
  randomDocumentFromSeed,
  randomEffectLayer,
  randomEmojiLayer,
  randomGlobal,
  randomTextLayer,
} from './randomConfig';

function expectValidTextAndEffectLayers(doc: ReturnType<typeof randomDocument>) {
  const textLayers = doc.layers.filter((layer) => layer.kind === 'text');
  const effectLayers = doc.layers.filter((layer) => layer.kind === 'effect');
  expect(textLayers.every((layer) => layer.content.trim().length > 0)).toBe(true);
  expect(effectLayers.every((layer) => layer.kind === 'effect' && layer.preset && layer.preset in EFFECT_PRESETS)).toBe(
    true,
  );
}

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
      'dotGrain',
      'dotGrainSize',
      'dotGrainDensity',
      'dotGrainJitter',
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

describe('randomTextLayer', () => {
  it('returns a text layer with cover-ready typography fields', () => {
    const layer = randomTextLayer(120, 'poster');

    expect(layer.kind).toBe('text');
    expect(layer.name).toBe('Poster Type');
    expect(layer.content).toBe('POSTER');
    expect(['BUNGEE', 'ANTON', 'ARCHIVO_BLACK', 'RUBIK_MONO']).toContain(layer.font);
    expect(layer.size).toBeGreaterThanOrEqual(92);
    expect(layer.size).toBeLessThanOrEqual(142);
    expect(layer.x).toBeGreaterThanOrEqual(0.48);
    expect(layer.x).toBeLessThanOrEqual(0.52);
    expect(layer.y).toBeGreaterThanOrEqual(0.42);
    expect(layer.y).toBeLessThanOrEqual(0.58);
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

  it('starts from one of the v2 random formula source layers', () => {
    const doc = randomDocument();
    expect(['fill', 'image', 'emoji', 'noise']).toContain(doc.layers[0].kind);
  });

  it('adds valid text layers when a formula includes type and focused effect preset layers', () => {
    const doc = randomDocument();
    expectValidTextAndEffectLayers(doc);
  });

  it('can build each v2 random formula as a valid document', () => {
    for (const formula of RANDOM_FORMULA_IDS) {
      const doc = randomDocumentForFormula(formula, 12000 + RANDOM_FORMULA_IDS.indexOf(formula));

      expect(doc.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
      expect(doc.layers.length).toBeGreaterThanOrEqual(4);
      expectValidTextAndEffectLayers(doc);
    }
  });

  it('creates deterministic documents from a seed for random examples', () => {
    expect(randomDocumentFromSeed(424242)).toEqual(randomDocumentFromSeed(424242));
  });

  it('covers image, type, texture, and print-damage formula shapes', () => {
    const imagePoster = randomDocumentForFormula('imagePoster', 1001);
    const typePoster = randomDocumentForFormula('typePoster', 1002);
    const texturePlate = randomDocumentForFormula('texturePlate', 1003);
    const printDamage = randomDocumentForFormula('printDamage', 1004);

    expect(imagePoster.layers.some((layer) => layer.kind === 'image')).toBe(true);
    expect(typePoster.layers.filter((layer) => layer.kind === 'text').length).toBeGreaterThanOrEqual(3);
    expect(texturePlate.layers.some((layer) => layer.kind === 'noise')).toBe(true);
    expect(printDamage.layers.some((layer) => layer.kind === 'effect' && layer.preset === 'halftone')).toBe(true);
  });
});
