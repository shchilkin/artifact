import { HEADER } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { compileLiveChain } from '../bindings.js';
import { DEFAULT_CENTER } from '../registry.js';
import { effectRegistry, RIPPLE_FRAG, ripple } from './index.js';

const context = { seed: 42, width: 540, height: 540 };

describe('ripple', () => {
  it('registers the port centred and deterministic', () => {
    expect(effectRegistry.get('ripple')).toBe(ripple);
    expect(ripple.fragment).toBe(RIPPLE_FRAG);
    expect(ripple.fragment.startsWith(HEADER)).toBe(true);
    expect(ripple.fragment).toMatch(/uniform\s+vec2\s+uCenter\s*;/);
    expect(ripple.centered).toBe(true);
    expect(ripple.stochastic).toBe(false);
    expect(ripple.fields).toEqual(['rippleAmt', 'rippleFreq', 'ripplePhase', 'rippleClick']);
  });

  it("passes the authored fields with the editor's resting phase, centre and no click ring", () => {
    expect(effectRegistry.pass('ripple', { rippleAmt: 20, rippleFreq: 3 }, context)).toEqual({
      id: 'ripple',
      fragment: RIPPLE_FRAG,
      uniforms: {
        uCenter: DEFAULT_CENTER,
        uRippleAmt: 20,
        uRippleFreq: 3,
        uRipplePhase: 0,
        uRippleClick: 0,
        uClickCenter: [0.5, 0.5],
      },
    });
  });

  it('is off at zero, as in the editor', () => {
    expect(effectRegistry.pass('ripple', { rippleAmt: 0, rippleFreq: 3 }, context)).toBeNull();
  });

  it('clamps the click impulse to 0..1', () => {
    expect(ripple.uniforms({ rippleAmt: 20, rippleFreq: 3, rippleClick: 2 }, context).uRippleClick).toBe(1);
    expect(ripple.uniforms({ rippleAmt: 20, rippleFreq: 3, rippleClick: -1 }, context).uRippleClick).toBe(0);
  });

  it('lets a time track move the phase and a click start a ring at the click position', () => {
    const live = compileLiveChain({
      passes: [{ effect: 'ripple', layer: { rippleAmt: 20, rippleFreq: 3 } }],
      context,
      bindings: {
        version: 1,
        loop: { durationSeconds: 2 },
        bindings: [
          { from: { track: 'step', fps: 30, stride: 1 / 60 }, to: { pass: 0, field: 'ripplePhase' }, mode: 'add' },
          { from: { input: 'click' }, to: { pass: 0, field: 'rippleClick' } },
          { from: { input: 'click.x' }, to: { pass: 0, uniform: 'uClickCenter', component: 0 } },
          { from: { input: 'click.y' }, to: { pass: 0, uniform: 'uClickCenter', component: 1 } },
        ],
      },
    });
    const frame = (time: number, inputs: Record<string, number>) =>
      live.frameUniforms({ time, frame: 0, clock: time, inputs, reducedMotion: false })?.[0];
    const resting = frame(0, { click: 0, 'click.x': 0.5, 'click.y': 0.5 });
    expect(resting).toMatchObject({ uRipplePhase: 0, uRippleClick: 0, uClickCenter: [0.5, 0.5] });
    expect(frame(1, {})?.uRipplePhase).toBeCloseTo(0.5);
    expect(frame(0, { click: 0.6, 'click.x': 1, 'click.y': 0 })).toMatchObject({
      uRippleClick: 0.6,
      uClickCenter: [1, 0],
    });
  });
});
