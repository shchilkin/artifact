import { describe, expect, it } from 'vitest';

import { makeEmojiLayer, makeFillLayer, makeImageLayer, makeSourceLayer, makeTextLayer } from '../../types/config';
import { clampPopupPosition, cloneLayerSnapshot, isGalleryEligibleLayer } from './helpers';

describe('isGalleryEligibleLayer', () => {
  it('returns true for primitive, noise, array, text, and image layers', () => {
    expect(isGalleryEligibleLayer(makeSourceLayer('primitive'))).toBe(true);
    expect(isGalleryEligibleLayer(makeSourceLayer('noise'))).toBe(true);
    expect(isGalleryEligibleLayer(makeSourceLayer('array'))).toBe(true);
    expect(isGalleryEligibleLayer(makeTextLayer())).toBe(true);
    expect(isGalleryEligibleLayer(makeImageLayer('data:image/png;base64,test'))).toBe(true);
  });

  it('returns false for non-gallery layers', () => {
    expect(isGalleryEligibleLayer(makeFillLayer())).toBe(false);
    expect(isGalleryEligibleLayer(makeEmojiLayer())).toBe(false);
  });
});

describe('cloneLayerSnapshot', () => {
  it('clones emoji arrays without sharing references', () => {
    const layer = makeEmojiLayer({ emojis: ['😀', '😎'] });
    const clone = cloneLayerSnapshot(layer);

    expect(clone).not.toBe(layer);
    expect(clone.emojis).toEqual(layer.emojis);
    expect(clone.emojis).not.toBe(layer.emojis);
  });

  it('returns shallow copies for non-emoji layers', () => {
    const layer = makeTextLayer();
    const clone = cloneLayerSnapshot(layer);

    expect(clone).not.toBe(layer);
    expect(clone).toEqual(layer);
  });
});

describe('clampPopupPosition', () => {
  it('clamps popup coordinates into the viewport bounds', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { innerWidth: 300, innerHeight: 220 },
    });

    expect(clampPopupPosition(280, 210, 120, 80)).toEqual({
      left: 172,
      top: 132,
    });
  });
});
