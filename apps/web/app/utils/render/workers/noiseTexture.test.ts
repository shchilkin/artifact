import { describe, expect, it } from 'vitest';
import { makeSourceLayer, type NoiseLayer } from '../../../types/config';
import { generateNoiseTextureData, toNoiseTextureLayerConfig } from './noiseTexture';

function makeNoiseLayer(partial: Parameters<typeof makeSourceLayer>[1] = {}): NoiseLayer {
  const layer = makeSourceLayer('noise', partial);
  if (layer.kind !== 'noise') throw new Error(`Expected noise layer, got ${layer.kind}`);
  return layer;
}

describe('generateNoiseTextureData', () => {
  it('creates deterministic noise pixels for the same config and seed', () => {
    const layer = makeNoiseLayer({
      color: '#102030',
      accentColor: '#f0c060',
      noiseScale: 18,
      noiseDetail: 4,
      noiseContrast: 55,
      noiseBalance: 42,
      noiseWarp: 12,
      noiseTurbulence: 20,
      noiseThreshold: 8,
    });
    const request = {
      layer: toNoiseTextureLayerConfig(layer),
      seed: 1234,
      textureSize: 32,
    };

    const a = generateNoiseTextureData(request);
    const b = generateNoiseTextureData(request);

    expect(a.width).toBe(32);
    expect(a.height).toBe(32);
    expect(a.data).toEqual(b.data);
  });

  it('changes pixels when the seed changes', () => {
    const layer = makeNoiseLayer({ noiseScale: 12, noiseDetail: 3 });
    const config = toNoiseTextureLayerConfig(layer);

    const a = generateNoiseTextureData({ layer: config, seed: 11, textureSize: 24 });
    const b = generateNoiseTextureData({ layer: config, seed: 12, textureSize: 24 });

    expect(a.data).not.toEqual(b.data);
  });
});
