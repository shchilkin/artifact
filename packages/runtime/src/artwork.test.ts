import { describe, expect, it, vi } from 'vitest';
import { createArtwork, type VisibilityObserver } from './artwork.js';
import { effectRegistry } from './effects/index.js';
import { createFakeCanvas, createFakeGl, createManualScheduler, type FakeGlOptions } from './testing/fakeGl.js';
import type { ChainPass } from './types.js';

const context = { seed: 1, width: 540, height: 540 };
const noisePass = (amount: number) => effectRegistry.pass('noiseWarp', { noiseWarp: amount }, context)!;
const threePasses: ChainPass[] = [noisePass(20), noisePass(40), noisePass(60)];

function setup(overrides: { reducedMotion?: boolean; chain?: ChainPass[]; gl?: FakeGlOptions } = {}) {
  const fake = createFakeGl(overrides.gl);
  const scheduler = createManualScheduler();
  let setVisible: (visible: boolean) => void = () => {};
  const stopObserving = vi.fn();
  const observeVisibility: VisibilityObserver = (_target, onChange) => {
    setVisible = onChange;
    return stopObserving;
  };
  const canvas = createFakeCanvas(fake);
  // A fake canvas is not an Element, so wire the observer through a canvas that passes the Element check.
  Object.setPrototypeOf(canvas, FakeElement.prototype);
  const artwork = createArtwork({
    canvas,
    source: {} as ImageBitmap,
    chain: overrides.chain ?? threePasses,
    reducedMotion: overrides.reducedMotion ?? false,
    devicePixelRatio: 1,
    scheduler,
    observeVisibility,
  });
  return { fake, scheduler, artwork, canvas, stopObserving, setVisible: (visible: boolean) => setVisible(visible) };
}

class FakeElement {}
vi.stubGlobal('Element', FakeElement);

describe('createArtwork', () => {
  it('draws one resting frame on creation and nothing more until started', () => {
    const { fake, scheduler, artwork } = setup();
    expect(artwork.state).toMatchObject({ status: 'idle', frames: 1, width: 540, height: 540 });
    expect(fake.counts.draws).toBe(3);
    expect(scheduler.requested).toBe(0);
  });

  it('draws one draw per pass per frame, the last to the canvas, with no readback', () => {
    const { fake, scheduler, artwork } = setup();
    artwork.start();
    scheduler.step(120);
    expect(artwork.state.frames).toBe(121);
    expect(fake.counts.draws).toBe(121 * 3);
    expect(fake.counts.readPixels).toBe(0);
    const lastFrame = fake.drawTargets.slice(-3);
    expect(lastFrame[0]).not.toBeNull();
    expect(lastFrame[1]).not.toBeNull();
    expect(lastFrame[0]).not.toBe(lastFrame[1]);
    expect(lastFrame[2]).toBeNull();
  });

  it('draws a pass with stages once per stage, ping-ponging, with the last stage to the canvas', () => {
    const split = effectRegistry.pass('rgbSplit', { rgbSplit: 8 }, context)!;
    expect(split.stages).toHaveLength(1);
    const { fake } = setup({ chain: [noisePass(20), split] });
    expect(fake.counts.draws).toBe(3);
    const [first, second, last] = fake.drawTargets;
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
    expect(last).toBeNull();
  });

  it('under reduced motion draws exactly one frame and schedules no animation frames', () => {
    const { fake, scheduler, artwork, setVisible } = setup({ reducedMotion: true });
    artwork.start();
    setVisible(false);
    setVisible(true);
    scheduler.step(10);
    expect(artwork.state).toMatchObject({ status: 'still', frames: 1 });
    expect(fake.counts.draws).toBe(3);
    expect(scheduler.requested).toBe(0);
  });

  it('pauses while off screen and resumes when visible', () => {
    const { scheduler, artwork, setVisible } = setup();
    artwork.start();
    scheduler.step(5);
    setVisible(false);
    expect(artwork.state.status).toBe('offscreen');
    expect(scheduler.pending).toBe(0);
    scheduler.step(5);
    expect(artwork.state.frames).toBe(6);
    setVisible(true);
    scheduler.step(5);
    expect(artwork.state.frames).toBe(11);
  });

  it('keeps time across pause and resume, and seek draws the requested time', () => {
    const { scheduler, artwork } = setup();
    artwork.start();
    scheduler.step(60, 1000 / 60);
    artwork.pause();
    expect(artwork.state.time).toBeCloseTo(1, 5);
    scheduler.step(60);
    expect(artwork.state.time).toBeCloseTo(1, 5);
    const frames = artwork.state.frames;
    artwork.seek(2.5);
    expect(artwork.state).toMatchObject({ time: 2.5, frames: frames + 1 });
  });

  it('passes time and inputs to the per-frame uniforms hook', () => {
    const fake = createFakeGl();
    const scheduler = createManualScheduler();
    const frameUniforms = vi.fn(() => [{ uIntensity: 0.1 }]);
    const artwork = createArtwork({
      canvas: createFakeCanvas(fake),
      source: {} as ImageBitmap,
      chain: [noisePass(10)],
      reducedMotion: false,
      observeVisibility: null,
      scheduler,
      frameUniforms,
    });
    artwork.setInput('pointer.x', 0.25);
    artwork.start();
    scheduler.step(1, 500);
    expect(frameUniforms).toHaveBeenLastCalledWith({
      time: 0.5,
      clock: 500,
      frame: 2,
      inputs: { 'pointer.x': 0.25 },
      reducedMotion: false,
    });
  });

  it('redraws once when an input changes while stopped, and not under reduced motion', () => {
    const { fake, scheduler, artwork } = setup({ chain: [noisePass(10)] });
    artwork.setInput('hover', 1);
    expect(artwork.state.frames).toBe(2);
    artwork.setInput('hover', 1);
    expect(artwork.state.frames).toBe(2);
    expect(scheduler.requested).toBe(0);
    // While running, the next frame picks the input up; no extra draw.
    artwork.start();
    artwork.setInput('hover', 0);
    expect(fake.counts.draws).toBe(2);

    const still = setup({ reducedMotion: true, chain: [noisePass(10)] });
    still.artwork.setInput('hover', 1);
    still.artwork.redraw();
    expect(still.artwork.state.frames).toBe(1);
  });

  it('tells the hook about reduced motion and redraws the still when it switches on', () => {
    const fake = createFakeGl();
    const scheduler = createManualScheduler();
    const frameUniforms = vi.fn(() => undefined);
    const listeners: ((event: { matches: boolean }) => void)[] = [];
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.push(listener),
      removeEventListener: () => {},
    }));
    try {
      const artwork = createArtwork({
        canvas: createFakeCanvas(fake),
        source: {} as ImageBitmap,
        chain: [noisePass(10)],
        observeVisibility: null,
        scheduler,
        frameUniforms,
      });
      artwork.start();
      scheduler.step(3);
      expect(frameUniforms).toHaveBeenLastCalledWith(expect.objectContaining({ reducedMotion: false }));
      for (const listener of listeners) listener({ matches: true });
      expect(artwork.state).toMatchObject({ status: 'still', frames: 5 });
      expect(frameUniforms).toHaveBeenLastCalledWith(expect.objectContaining({ reducedMotion: true }));
      expect(scheduler.pending).toBe(0);
      artwork.destroy();
    } finally {
      vi.unstubAllGlobals();
      vi.stubGlobal('Element', FakeElement);
    }
  });

  it('resizes the drawing buffer within maxRenderSize and redraws when stopped', () => {
    const fake = createFakeGl();
    const canvas = createFakeCanvas(fake);
    const artwork = createArtwork({
      canvas,
      source: {} as ImageBitmap,
      chain: threePasses,
      reducedMotion: true,
      observeVisibility: null,
      scheduler: createManualScheduler(),
      maxRenderSize: 400,
    });
    expect([canvas.width, canvas.height]).toEqual([400, 400]);
    artwork.resize(800, 400);
    expect(artwork.state).toMatchObject({ width: 400, height: 200, frames: 2 });
    artwork.resize(800, 400);
    expect(artwork.state.frames).toBe(2);
  });

  it('destroy deletes every GL object it created and stops observing', () => {
    const { fake, scheduler, artwork, stopObserving } = setup();
    artwork.start();
    scheduler.step(3);
    artwork.resize(270, 270);
    expect(fake.counts.created).toBeGreaterThan(0);
    artwork.destroy();
    expect(fake.live()).toEqual({});
    expect(fake.counts.deleted).toBe(fake.counts.created);
    expect(stopObserving).toHaveBeenCalledOnce();
    expect(scheduler.pending).toBe(0);
    expect(artwork.state.status).toBe('destroyed');
    // Calls after destroy are no-ops rather than GL work on deleted objects.
    artwork.start();
    artwork.seek(1);
    artwork.resize(100, 100);
    artwork.destroy();
    expect(scheduler.pending).toBe(0);
    expect(fake.counts.deleted).toBe(fake.counts.created);
  });

  it('copies the source to the canvas when the chain is empty', () => {
    const { fake, artwork } = setup({ chain: [] });
    expect(fake.counts.draws).toBe(1);
    expect(fake.drawTargets).toEqual([null]);
    artwork.destroy();
    expect(fake.live()).toEqual({});
  });

  it('without KHR_parallel_shader_compile is ready on creation, as before', async () => {
    const { artwork } = setup();
    expect(artwork.state.status).toBe('idle');
    await expect(artwork.ready).resolves.toBeUndefined();
  });

  it('throws on creation when a shader fails without the extension, leaving nothing behind', () => {
    const fake = createFakeGl({ failCompile: true });
    expect(() =>
      createArtwork({
        canvas: createFakeCanvas(fake),
        source: {} as ImageBitmap,
        chain: threePasses,
        observeVisibility: null,
        scheduler: createManualScheduler(),
      }),
    ).toThrow(/Shader compile failed/);
    expect(fake.live()).toEqual({});
  });

  describe('with KHR_parallel_shader_compile (issue #419)', () => {
    it('draws nothing and queries nothing that blocks until the shaders are linked, then draws the resting frame', async () => {
      const { fake, scheduler, artwork } = setup({ gl: { parallelCompile: true } });
      let settled = false;
      void artwork.ready.then(() => {
        settled = true;
      });
      expect(artwork.state).toMatchObject({ status: 'loading', frames: 0, width: 540, height: 540 });
      scheduler.step(5);
      expect(artwork.state).toMatchObject({ status: 'loading', frames: 0 });
      expect(fake.counts.draws).toBe(0);
      expect(scheduler.pending).toBe(1);
      fake.completeShaders();
      scheduler.step();
      await Promise.resolve();
      expect(settled).toBe(true);
      expect(fake.blockingQueries).toEqual([]);
      expect(artwork.state).toMatchObject({ status: 'idle', frames: 1 });
      expect(fake.counts.draws).toBe(3);
      expect(scheduler.pending).toBe(0);
    });

    it('queues start, seek and inputs made while loading for the first frame', async () => {
      const frameUniforms = vi.fn(() => undefined);
      const fake = createFakeGl({ parallelCompile: true });
      const scheduler = createManualScheduler();
      const artwork = createArtwork({
        canvas: createFakeCanvas(fake),
        source: {} as ImageBitmap,
        chain: threePasses,
        reducedMotion: false,
        observeVisibility: null,
        scheduler,
        frameUniforms,
      });
      artwork.start();
      artwork.seek(2);
      artwork.setInput('hover', 1);
      artwork.resize(270, 270);
      artwork.redraw();
      scheduler.step(3);
      expect(artwork.state).toMatchObject({ status: 'loading', frames: 0, width: 270, height: 270, time: 2 });
      expect(frameUniforms).not.toHaveBeenCalled();
      fake.completeShaders();
      scheduler.step();
      await artwork.ready;
      expect(artwork.state).toMatchObject({ status: 'running', frames: 1 });
      expect(frameUniforms).toHaveBeenLastCalledWith(expect.objectContaining({ time: 2, inputs: { hover: 1 } }));
      scheduler.step(2, 500);
      expect(artwork.state.frames).toBe(3);
      expect(artwork.state.time).toBeCloseTo(3, 5);
    });

    it('keeps the still under reduced motion once ready', async () => {
      const { fake, scheduler, artwork } = setup({ gl: { parallelCompile: true }, reducedMotion: true });
      artwork.start();
      fake.completeShaders();
      scheduler.step();
      await artwork.ready;
      scheduler.step(5);
      expect(artwork.state).toMatchObject({ status: 'still', frames: 1 });
      expect(scheduler.pending).toBe(0);
    });

    it('rejects ready and reports failed when a shader fails to compile', async () => {
      const { fake, scheduler, artwork } = setup({ gl: { parallelCompile: true, failCompile: true } });
      artwork.start();
      fake.completeShaders();
      scheduler.step();
      await expect(artwork.ready).rejects.toThrow(/Shader compile failed/);
      expect(artwork.state).toMatchObject({ status: 'failed', frames: 0 });
      artwork.seek(1);
      scheduler.step(3);
      expect(fake.counts.draws).toBe(0);
      artwork.destroy();
      expect(fake.live()).toEqual({});
    });

    it('stops polling and rejects ready when destroyed while loading', async () => {
      const { fake, scheduler, artwork } = setup({ gl: { parallelCompile: true } });
      artwork.destroy();
      expect(scheduler.pending).toBe(0);
      expect(fake.live()).toEqual({});
      await expect(artwork.ready).rejects.toThrow(/destroyed/);
      expect(artwork.state.status).toBe('destroyed');
    });
  });
});
