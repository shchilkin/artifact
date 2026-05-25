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
