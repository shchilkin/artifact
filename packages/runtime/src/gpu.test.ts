import { describe, expect, it, vi } from 'vitest';

const filters = vi.hoisted(() => [] as Array<{ fragment: string; uniforms: Record<string, unknown> }>);

vi.mock('pixi.js', () => ({
  Container: class Container {},
  Filter: class Filter {
    padding = -1;
    constructor(_vertex: unknown, fragment: string, uniforms: Record<string, unknown>) {
      filters.push({ fragment, uniforms });
    }
  },
  Renderer: class Renderer {},
  RenderTexture: { create: vi.fn() },
  Sprite: class Sprite {},
  Texture: { from: vi.fn() },
}));

describe('Artifact GPU effects', () => {
  it('builds the Viber filters in canonical order with editor-compatible uniforms', async () => {
    filters.length = 0;
    const { buildArtifactGpuEffectFilters } = await import('./gpu.js');
    const result = buildArtifactGpuEffectFilters({ noiseWarp: 100, vortex: 20, tearAmt: 4, tearSize: 4 }, 4242);

    expect(result).toHaveLength(3);
    expect(filters.map(({ fragment }) => fragment)).toEqual([
      expect.stringContaining('smooth21'),
      expect.stringContaining('angle += uIntensity'),
      expect.stringContaining('float chunkId'),
    ]);
    expect(filters.map(({ uniforms }) => uniforms)).toEqual([
      { uIntensity: 0.08, uSeed: 4242 },
      { uIntensity: 0.6 },
      { uIntensity: 0.028, uChunkH: 0.004, uSeed: 4242 },
    ]);
  });
});
