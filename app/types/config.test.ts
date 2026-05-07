import { describe, it, expect } from 'vitest';
import {
  makeTextLayer,
  makeEffectLayer,
  makeEmojiLayer,
  cloneDocument,
} from './config';
import type { CanvasDocument } from './config';

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
      'grain', 'scanlines', 'ca', 'glitch', 'tintOp',
      'rays', 'rayInt', 'morphAmt', 'morphFreq', 'tearAmt', 'tearSize',
      'noiseWarp', 'vortex', 'barrel', 'mirror', 'dataMosh', 'interlace',
      'pixelate', 'hueShift', 'rgbSplit', 'vignette', 'bloom', 'posterize',
      'filmBurn', 'duotone', 'halftone', 'risoShift', 'risoAngle',
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

describe('cloneDocument', () => {
  it('returns an object deeply equal to the original', () => {
    const original: CanvasDocument = {
      global: { bg: '#120020', seed: 42, aspect: '1:1' },
      layers: [makeEmojiLayer({ id: 'test-emoji' })],
    };
    const cloned = cloneDocument(original);
    expect(cloned).toEqual(original);
  });

  it('does not return the same reference as the original', () => {
    const original: CanvasDocument = {
      global: { bg: '#120020', seed: 42, aspect: '1:1' },
      layers: [makeEmojiLayer({ id: 'test-emoji' })],
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
    };
    const cloned = cloneDocument(original);
    const clonedEmojiLayer = cloned.layers[0];
    if (clonedEmojiLayer.kind === 'emoji') {
      clonedEmojiLayer.emojis.push('🔥');
    }
    expect(emojiLayer.emojis).toEqual(['😂', '💀']);
  });
});

