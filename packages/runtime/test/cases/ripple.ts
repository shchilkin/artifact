import { defineEffectCase, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Ripple at the editor preset's values (20, 3 rings). A step track moves `ripplePhase` by one turn per 2 s loop at
 * 30 steps a second, so the rings travel outward one wavelength per loop and the loop closes (phase 1 is phase 0).
 * A click starts a ring packet at the click position (`click.x/y` → `uClickCenter`) that travels outward as the
 * impulse decays (`click` → `rippleClick`, unsmoothed, since the shader reads the ring's age from it). At rest the
 * click is 0, so the bindings leave the authored still unchanged. `click-centre` and `click-corner` are clicks 0.25 s
 * old (impulse e^−0.5) at the centre and at the bottom-right corner.
 */
const CLICK_IMPULSE = Math.exp(-0.5);

export default defineEffectCase({
  effect: 'ripple',
  layer: { rippleAmt: 20, rippleFreq: 3 },
  frames: [
    ...MOTION_FRAMES,
    { name: 'click-centre', t: 0, input: { click: CLICK_IMPULSE, 'click.x': 0.5, 'click.y': 0.5 } },
    { name: 'click-corner', t: 0, input: { click: CLICK_IMPULSE, 'click.x': 1, 'click.y': 1 } },
  ],
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
