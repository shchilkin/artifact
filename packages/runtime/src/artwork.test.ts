import { describe, expect, it, vi } from 'vitest';
import { createArtwork, type VisibilityObserver } from './artwork.js';
import { effectRegistry } from './effects/index.js';
import { createFakeCanvas, createFakeGl, createManualScheduler } from './testing/fakeGl.js';
import type { ChainPass } from './types.js';

const context = { seed: 1, width: 540, height: 540 };
const noisePass = (amount: number) => effectRegistry.pass('noiseWarp', { noiseWarp: amount }, context)!;
const threePasses: ChainPass[] = [noisePass(20), noisePass(40), noisePass(60)];

function setup(overrides: { reducedMotion?: boolean; chain?: ChainPass[] } = {}) {
  const fake = createFakeGl();
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
    expect(frameUniforms).toHaveBeenLastCalledWith({ time: 0.5, frame: 1, inputs: { 'pointer.x': 0.25 } });
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
});
