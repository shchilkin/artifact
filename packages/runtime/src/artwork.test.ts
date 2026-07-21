import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMixedMediaArtwork } from './artwork.js';
import type { MixedMediaMotionRecipe } from './types.js';

function composition() {
  return {
    artifactPackage: 'project',
    manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3 },
    document: {
      schemaVersion: 3,
      global: { seed: 7, aspect: '1:1', bg: 'transparent' },
      layers: [{ id: 'fill', kind: 'fill', color: '#ff3300' }],
    },
  };
}

function recipe(): MixedMediaMotionRecipe {
  return {
    kind: 'artifact-motion-recipe',
    schemaVersion: 1,
    profile: 'mixed-media-2d@1',
    compositionSha256: 'a'.repeat(64),
    timeline: { durationSeconds: 4, mode: 'loop' },
    tracks: [],
  };
}

interface CanvasHarness {
  canvas: HTMLCanvasElement;
  commits: number;
  fills: number;
  failAfterFill?: number;
}

function canvasHarness(): CanvasHarness {
  const harness: CanvasHarness = { canvas: undefined as unknown as HTMLCanvasElement, commits: 0, fills: 0 };
  class FakeCanvas {
    clientHeight = 256;
    clientWidth = 256;
    height = 0;
    width = 0;
    readonly ownerDocument = { createElement: () => new FakeCanvas(false) };
    constructor(private readonly target = true) {}
    getContext() {
      return {
        clearRect() {},
        createRadialGradient: () => ({ addColorStop() {} }),
        drawImage: () => {
          if (this.target) harness.commits += 1;
        },
        fillRect: () => {
          harness.fills += 1;
          if (harness.failAfterFill && harness.fills >= harness.failAfterFill)
            throw new Error('synthetic render failure');
        },
        fillStyle: '',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        restore() {},
        save() {},
      };
    }
  }
  harness.canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
  return harness;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('document-backed Mixed Media Artwork Session', () => {
  it('returns structured capability and recipe diagnostics for a malformed sidecar', async () => {
    const harness = canvasHarness();

    await expect(
      createMixedMediaArtwork({
        canvas: harness.canvas,
        composition: composition(),
        motionRecipe: { ...recipe(), timeline: { durationSeconds: 0, mode: 'loop' } },
        pixelRatio: 1,
        profile: 'mixed-media-2d@1',
      }),
    ).rejects.toMatchObject({
      name: 'MixedMediaRecipeCompatibilityError',
      capabilityReport: { status: 'ready' },
      report: { compatible: false, issues: [expect.objectContaining({ code: 'invalid-recipe' })] },
    });
  });

  it('renders the Neutral Frame before returning and owns start, pause, seek, resize, and idempotent destroy', async () => {
    let scheduled: FrameRequestCallback | undefined;
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      scheduled = callback;
      return 11;
    });
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const harness = canvasHarness();
    const frames: number[] = [];
    const session = await createMixedMediaArtwork({
      canvas: harness.canvas,
      composition: composition(),
      motionRecipe: recipe(),
      onFrame: ({ choreographyTime }) => frames.push(choreographyTime),
      pixelRatio: 1,
      profile: 'mixed-media-2d@1',
    });

    expect(harness.commits).toBe(1);
    expect(frames).toEqual([0]);
    expect(session.currentTime).toBe(0);
    expect(session.isRunning).toBe(false);

    session.start();
    expect(session.isRunning).toBe(true);
    expect(scheduled).toBeTypeOf('function');
    session.pause();
    expect(session.isRunning).toBe(false);
    expect(cancel).toHaveBeenCalledWith(11);

    await session.seek(4);
    expect(session.currentTime).toBe(0);
    await session.resize(1024, 512);
    expect(harness.canvas.width).toBe(512);
    expect(harness.canvas.height).toBe(256);

    session.destroy();
    session.destroy();
    expect(harness.canvas.width).toBe(1);
    expect(harness.canvas.height).toBe(1);
  });

  it('keeps the previous host frame intact when a later offscreen render fails', async () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const harness = canvasHarness();
    const session = await createMixedMediaArtwork({
      canvas: harness.canvas,
      composition: composition(),
      motionRecipe: recipe(),
      pixelRatio: 1,
      profile: 'mixed-media-2d@1',
    });
    expect(harness.commits).toBe(1);
    harness.failAfterFill = harness.fills + 1;

    await expect(session.seek(1)).rejects.toThrow('synthetic render failure');
    expect(harness.commits).toBe(1);
    session.destroy();
  });

  it('keeps the caller-owned canvas intact when the Neutral Frame cannot initialize', async () => {
    const harness = canvasHarness();
    harness.canvas.width = 640;
    harness.canvas.height = 360;
    harness.failAfterFill = 1;

    await expect(
      createMixedMediaArtwork({
        canvas: harness.canvas,
        composition: composition(),
        motionRecipe: recipe(),
        pixelRatio: 1,
        profile: 'mixed-media-2d@1',
      }),
    ).rejects.toThrow('synthetic render failure');
    expect(harness.commits).toBe(0);
    expect(harness.canvas.width).toBe(640);
    expect(harness.canvas.height).toBe(360);
  });

  it('survives ten complete create, start, and destroy cycles', async () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    for (let index = 0; index < 10; index += 1) {
      const harness = canvasHarness();
      const session = await createMixedMediaArtwork({
        canvas: harness.canvas,
        composition: composition(),
        motionRecipe: recipe(),
        pixelRatio: 1,
        profile: 'mixed-media-2d@1',
      });
      session.start();
      session.destroy();
      expect(harness.commits).toBe(1);
      expect(harness.canvas.width).toBe(1);
    }
  });
});
