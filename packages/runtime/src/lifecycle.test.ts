import { describe, expect, it } from 'vitest';
import { initialLifecycle, type LifecycleEvent, lifecycleStatus, shouldAnimate, transition } from './lifecycle.js';
import { computeRenderSize } from './sizing.js';

const run = (events: LifecycleEvent[], reducedMotion = false) =>
  events.reduce(transition, initialLifecycle({ reducedMotion }));

describe('lifecycle state', () => {
  it('starts idle and animates only after start', () => {
    expect(lifecycleStatus(run([]))).toBe('idle');
    expect(shouldAnimate(run([]))).toBe(false);
    expect(shouldAnimate(run([{ type: 'start' }]))).toBe(true);
    expect(lifecycleStatus(run([{ type: 'start' }]))).toBe('running');
    expect(shouldAnimate(run([{ type: 'start' }, { type: 'pause' }]))).toBe(false);
  });

  it('pauses off screen and resumes when visible again', () => {
    const offscreen = run([{ type: 'start' }, { type: 'visibility', visible: false }]);
    expect(lifecycleStatus(offscreen)).toBe('offscreen');
    expect(shouldAnimate(offscreen)).toBe(false);
    expect(shouldAnimate(transition(offscreen, { type: 'visibility', visible: true }))).toBe(true);
  });

  it('never animates under reduced motion', () => {
    const still = run([{ type: 'start' }, { type: 'visibility', visible: true }], true);
    expect(lifecycleStatus(still)).toBe('still');
    expect(shouldAnimate(still)).toBe(false);
    expect(shouldAnimate(transition(still, { type: 'reducedMotion', reducedMotion: false }))).toBe(true);
  });

  it('ignores every event after destroy', () => {
    const destroyed = run([{ type: 'start' }, { type: 'destroy' }]);
    expect(lifecycleStatus(destroyed)).toBe('destroyed');
    for (const event of [
      { type: 'start' },
      { type: 'visibility', visible: true },
      { type: 'reducedMotion', reducedMotion: false },
    ] as const) {
      expect(transition(destroyed, event)).toBe(destroyed);
    }
  });

  it('returns the same state object for no-op events', () => {
    const state = run([{ type: 'start' }]);
    expect(transition(state, { type: 'start' })).toBe(state);
    expect(transition(state, { type: 'visibility', visible: true })).toBe(state);
  });

  describe('while shaders load (issue #419)', () => {
    const loading = (events: LifecycleEvent[], reducedMotion = false) =>
      events.reduce(transition, initialLifecycle({ reducedMotion, loading: true }));

    it('reports loading and never animates, whatever the host asked', () => {
      for (const events of [
        [],
        [{ type: 'start' }],
        [{ type: 'start' }, { type: 'visibility', visible: true }],
      ] as const) {
        const state = loading([...events]);
        expect(lifecycleStatus(state)).toBe('loading');
        expect(shouldAnimate(state)).toBe(false);
      }
      expect(lifecycleStatus(loading([], true))).toBe('loading');
    });

    it('plays a start queued while loading once ready, and stays idle otherwise', () => {
      const queued = loading([{ type: 'start' }, { type: 'ready' }]);
      expect(lifecycleStatus(queued)).toBe('running');
      expect(shouldAnimate(queued)).toBe(true);
      expect(lifecycleStatus(loading([{ type: 'ready' }]))).toBe('idle');
      expect(lifecycleStatus(loading([{ type: 'start' }, { type: 'pause' }, { type: 'ready' }]))).toBe('idle');
      expect(
        lifecycleStatus(loading([{ type: 'start' }, { type: 'visibility', visible: false }, { type: 'ready' }])),
      ).toBe('offscreen');
      expect(lifecycleStatus(loading([{ type: 'start' }, { type: 'ready' }], true))).toBe('still');
    });

    it('fails for good when a shader fails, and destroy still wins', () => {
      const failed = loading([{ type: 'start' }, { type: 'fail' }]);
      expect(lifecycleStatus(failed)).toBe('failed');
      expect(shouldAnimate(failed)).toBe(false);
      expect(transition(failed, { type: 'ready' })).toBe(failed);
      expect(lifecycleStatus(transition(failed, { type: 'destroy' }))).toBe('destroyed');
      expect(lifecycleStatus(loading([{ type: 'destroy' }]))).toBe('destroyed');
      expect(transition(loading([{ type: 'destroy' }]), { type: 'ready' }).loading).toBe(true);
    });

    it('ignores ready and fail once loaded', () => {
      const state = run([{ type: 'start' }]);
      expect(transition(state, { type: 'ready' })).toBe(state);
      expect(transition(state, { type: 'fail' })).toBe(state);
    });
  });
});

describe('render size', () => {
  const base = { cssWidth: 540, cssHeight: 540, devicePixelRatio: 1, maxDevicePixelRatio: 2, maxRenderSize: 1080 };

  it('multiplies the CSS size by the device pixel ratio', () => {
    expect(computeRenderSize({ ...base, devicePixelRatio: 2 })).toEqual({ width: 1080, height: 1080 });
  });

  it('caps the device pixel ratio', () => {
    expect(computeRenderSize({ ...base, cssWidth: 300, cssHeight: 200, devicePixelRatio: 3 })).toEqual({
      width: 600,
      height: 400,
    });
  });

  it('scales the longer side down to maxRenderSize, keeping the aspect ratio', () => {
    expect(computeRenderSize({ ...base, cssWidth: 1000, cssHeight: 500, devicePixelRatio: 2 })).toEqual({
      width: 1080,
      height: 540,
    });
  });

  it('falls back to safe values for empty or invalid input', () => {
    expect(computeRenderSize({ ...base, cssWidth: 0, cssHeight: Number.NaN, devicePixelRatio: 0 })).toEqual({
      width: 1,
      height: 1,
    });
  });
});
