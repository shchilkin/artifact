import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * VHS streaks (Glitch) at 14 bands, the editor preset. Over a 4 s loop a step track re-seeds the bands twelve times a
 * second (48 steps, so the loop closes): each new seed is a new LCG stream, so every step draws new bands, as a new
 * seed does in the editor. Two short pulses (at 0.2 and 0.7 loop turns, 0.08 long) burst the band count by 40, so
 * `t-0.25` and `t-0.75` record a burst and `t-0` and `t-0.5` the resting count. A click adds up to 50 bands, decaying
 * with the click input; the `click` frame records the press. Glitch has no pointer-position or speed binding, so the
 * pointer frames match `t-0`.
 */
export default defineEffectCase({
  effect: 'glitch',
  layer: { glitch: 14 },
  frames: [...MOTION_FRAMES, ...INPUT_FRAMES, { name: 'click', t: 0, input: { click: 1 } }],
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      { from: { track: 'step', fps: 12, stride: 1 }, to: { pass: 0, field: 'seedOffset' }, mode: 'add' },
      {
        from: { track: 'pulse', at: [0.2, 0.7], length: 0.08 },
        to: { pass: 0, field: 'glitch' },
        range: [0, 40],
        mode: 'add',
        clamp: [0, 100],
      },
      {
        from: { input: 'click' },
        to: { pass: 0, field: 'glitch' },
        range: [0, 50],
        mode: 'add',
        clamp: [0, 100],
      },
    ],
  },
});
