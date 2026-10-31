import { describe, expect, it } from 'vitest';
import {
  type CanvasDocument,
  type Layer,
  makeDocument,
  makeEffectPresetLayer,
  makeFillLayer,
  makeTextLayer,
  TEXT_TYPOGRAPHY_DEFAULTS,
  type TextLayer,
} from '../../types/config';
import { renderDocument } from '../../utils/renderer';

function doc(layers: Layer[]): CanvasDocument {
  return makeDocument({
    global: { bg: 'transparent', seed: 1, aspect: '1:1' },
    layers,
    export: { format: 'png', scale: 1, target: 'cover' },
  });
}

async function pixel(document: CanvasDocument, x: number, y: number, size = 40) {
  const canvas = await renderDocument(document, size, size, new Map());
  return [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data];
}

describe('gradient fill', () => {
  it('runs a linear gradient from Color to End color along the angle', async () => {
    const fill = makeFillLayer({ fillMode: 'linear', color: '#ff0000', colorB: '#0000ff', angle: 0 });
    const left = await pixel(doc([fill]), 1, 20);
    const right = await pixel(doc([fill]), 38, 20);
    expect(left[0]).toBeGreaterThan(230);
    expect(left[2]).toBeLessThan(25);
    expect(right[2]).toBeGreaterThan(230);
    expect(right[0]).toBeLessThan(25);

    const down = makeFillLayer({ fillMode: 'linear', color: '#ff0000', colorB: '#0000ff', angle: 90 });
    expect((await pixel(doc([down]), 20, 1))[0]).toBeGreaterThan(230);
    expect((await pixel(doc([down]), 20, 38))[2]).toBeGreaterThan(230);
  });

  it('runs a radial gradient from the center to the corners', async () => {
    const fill = makeFillLayer({ fillMode: 'radial', color: '#ffffff', colorB: '#000000' });
    expect((await pixel(doc([fill]), 20, 20))[0]).toBeGreaterThan(240);
    expect((await pixel(doc([fill]), 0, 0))[0]).toBeLessThan(15);
  });

  it('keeps a solid fill solid', async () => {
    const fill = makeFillLayer({ color: '#00ff00', colorB: '#ff0000' });
    expect(await pixel(doc([fill]), 38, 38)).toEqual([0, 255, 0, 255]);
  });
});

function textDoc(patch: Partial<TextLayer>) {
  return doc([
    makeFillLayer({ color: '#000000' }),
    makeTextLayer({ content: 'I', size: 300, color: '#ffffff', ...patch }),
  ]);
}

async function rowCoverage(document: CanvasDocument, y: number, size = 80) {
  const canvas = await renderDocument(document, size, size, new Map());
  const row = canvas.getContext('2d')!.getImageData(0, y, size, 1).data;
  let lit = 0;
  for (let i = 0; i < row.length; i += 4) if (row[i] > 128) lit += 1;
  return lit;
}

describe('text typography', () => {
  it('draws exactly as before with the default typography', async () => {
    const plain = await renderDocument(textDoc({}), 80, 80, new Map());
    const explicit = await renderDocument(textDoc({ ...TEXT_TYPOGRAPHY_DEFAULTS }), 80, 80, new Map());
    expect(explicit.getContext('2d')!.getImageData(0, 0, 80, 80).data).toEqual(
      plain.getContext('2d')!.getImageData(0, 0, 80, 80).data,
    );
  });

  it('widens letters with an outline and spreads them with tracking', async () => {
    const base = await rowCoverage(textDoc({ content: 'II', size: 160 }), 270, 540);
    const outlined = await rowCoverage(
      textDoc({ content: 'II', size: 160, outlineWidth: 10, outlineColor: '#ffffff' }),
      270,
      540,
    );
    expect(outlined).toBeGreaterThan(base + 20);
  });

  it('spreads letters apart with tracking', async () => {
    const span = async (tracking: number) => {
      const canvas = await renderDocument(textDoc({ content: 'II', size: 160, tracking }), 540, 540, new Map());
      const row = canvas.getContext('2d')!.getImageData(0, 270, 540, 1).data;
      const lit = [];
      for (let x = 0; x < 540; x += 1) if (row[x * 4] > 128) lit.push(x);
      return lit.at(-1)! - lit[0];
    };
    expect(await span(60)).toBeGreaterThan((await span(0)) + 40);
  });

  it('casts a shadow away from the letters', async () => {
    const shadowed = textDoc({
      content: 'I',
      size: 160,
      color: '#000000',
      shadowOpacity: 100,
      shadowColor: '#ffffff',
      shadowX: 40,
      shadowY: 0,
      shadowBlur: 0,
    });
    const plain = await rowCoverage(textDoc({ content: 'I', size: 160, color: '#000000' }), 270, 540);
    expect(plain).toBe(0);
    expect(await rowCoverage(shadowed, 270, 540)).toBeGreaterThan(5);
  });
});

describe('clip to layer below', () => {
  const ground = makeFillLayer({ id: 'ground', color: '#000000' });
  const shape = makeTextLayer({ id: 'shape', content: 'I', size: 300, color: '#ffffff' });
  const paint = makeFillLayer({ id: 'paint', color: '#ff0000', clipToBelow: true });

  it('draws a clipped layer only inside the layer below it', async () => {
    const clipped = doc([ground, shape, paint]);
    const inside = await pixel(clipped, 270, 270, 540);
    const outside = await pixel(clipped, 20, 20, 540);
    expect(inside).toEqual([255, 0, 0, 255]);
    expect(outside).toEqual([0, 0, 0, 255]);
  });

  it('clips through effect layers and stacked clipped layers to the group base', async () => {
    const tint = makeFillLayer({ id: 'tint', color: '#0000ff', opacity: 50, clipToBelow: true });
    const grain = makeEffectPresetLayer('vignette', { id: 'vig', vignette: 0 });
    const clipped = doc([ground, shape, paint, grain, tint]);
    expect((await pixel(clipped, 20, 20, 540)).slice(0, 3)).toEqual([0, 0, 0]);
    const inside = await pixel(clipped, 270, 270, 540);
    expect(inside[2]).toBeGreaterThan(100);
    expect(inside[0]).toBeGreaterThan(100);
  });

  it('draws normally when clipping is off', async () => {
    const unclipped = doc([ground, shape, { ...paint, clipToBelow: false }]);
    expect(await pixel(unclipped, 20, 20, 540)).toEqual([255, 0, 0, 255]);
  });
});

describe('effects applied to the layer below', () => {
  const ground = makeFillLayer({ id: 'ground', color: '#ff0000' });
  const shape = makeTextLayer({ id: 'shape', content: 'I', size: 300, color: '#ffffff' });
  const shadow = (appliesTo: 'all' | 'layerBelow') =>
    makeEffectPresetLayer('shadow', {
      id: 'shadow',
      appliesTo,
      shadowOpacity: 100,
      shadowColor: '#000000',
      shadowX: 120,
      shadowY: 0,
      shadowBlur: 0,
    });

  it('casts a shadow from the layer below only, over what is under it', async () => {
    const scoped = doc([ground, shape, shadow('layerBelow')]);
    expect(await pixel(scoped, 270, 270, 540)).toEqual([255, 255, 255, 255]);
    expect((await pixel(scoped, 390, 270, 540)).slice(0, 3)).toEqual([0, 0, 0]);
    expect(await pixel(scoped, 20, 20, 540)).toEqual([255, 0, 0, 255]);
  });

  it('shadows everything below by default, which an opaque ground hides', async () => {
    const all = doc([ground, shape, shadow('all')]);
    expect(await pixel(all, 390, 270, 540)).toEqual([255, 0, 0, 255]);
  });
});
