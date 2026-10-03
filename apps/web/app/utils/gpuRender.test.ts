import { describe, expect, it, vi } from 'vitest';

const pixiMock = vi.hoisted(() => ({
  rendererConstructed: vi.fn(),
}));

vi.mock('pixi.js', () => ({
  Container: class Container {},
  Renderer: class Renderer {
    constructor() {
      pixiMock.rendererConstructed();
      throw new Error('WebGL unavailable');
    }
  },
  RenderTexture: { create: vi.fn() },
  Sprite: class Sprite {},
  Texture: { from: vi.fn() },
}));

describe('gpuRenderToCanvas', () => {
  it('falls back to the source canvas when WebGL is unavailable', async () => {
    vi.resetModules();
    pixiMock.rendererConstructed.mockClear();

    const source = document.createElement('canvas');
    source.width = 2;
    source.height = 2;
    const sourceCtx = source.getContext('2d')!;
    sourceCtx.fillStyle = 'rgb(255, 0, 0)';
    sourceCtx.fillRect(0, 0, 2, 2);

    const { gpuRenderToCanvas } = await import('./gpuRender');
    const output = await gpuRenderToCanvas({
      width: 2,
      height: 2,
      source,
      filters: [{} as never],
    });

    expect(pixiMock.rendererConstructed).toHaveBeenCalledTimes(1);
    expect(output).not.toBe(source);
    expect(Array.from(output.getContext('2d')!.getImageData(0, 0, 1, 1).data)).toEqual([255, 0, 0, 255]);
  });
});

describe('unpremultiplyAlpha', () => {
  // Pixi's Extract._unpremultiplyAlpha, the reference the async readback must match byte for byte.
  function pixiUnpremultiply(pixels: Uint8Array) {
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3];
      if (alpha !== 0) {
        const a = 255.001 / alpha;
        pixels[i] = pixels[i] * a + 0.5;
        pixels[i + 1] = pixels[i + 1] * a + 0.5;
        pixels[i + 2] = pixels[i + 2] * a + 0.5;
      }
    }
  }

  it('matches Pixi for every premultiplied channel and alpha value', async () => {
    const { unpremultiplyAlpha } = await import('./gpuRender');
    const pixels: number[] = [];
    for (let alpha = 0; alpha < 256; alpha += 1) {
      for (let channel = 0; channel <= alpha; channel += 1) pixels.push(channel, alpha - channel, channel >> 1, alpha);
    }
    const ours = new Uint8Array(pixels);
    const reference = new Uint8Array(pixels);

    unpremultiplyAlpha(ours);
    pixiUnpremultiply(reference);

    expect(Array.from(ours)).toEqual(Array.from(reference));
  });
});
