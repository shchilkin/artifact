import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Data Mosh at 30. Over a 4 s loop a step track re-seeds the mosh six times a second (24 steps, so the loop closes);
 * the shader reads the seed as `uSeed * 0.001`, so a stride of 337 moves the hash by a third of a block and every
 * sampled loop position shifts different blocks. Two short pulses (at 0.2 and 0.7 loop turns, 0.08 long) burst the
 * amount by 40, so `t-0.25` and `t-0.75` record a burst and `t-0` and `t-0.5` the resting amount. A click adds up to
 * 50, decaying with the click input; the `click` frame records the press. Data Mosh has no pointer-position or speed
 * binding, so the pointer frames match `t-0`.
 */
export default defineEffectCase({
  effect: 'dataMosh',
  layer: { dataMosh: 30 },
  frames: [...MOTION_FRAMES, ...INPUT_FRAMES, { name: 'click', t: 0, input: { click: 1 } }],
  // The editor's fragment wraps the sample with `fract(norm + offset)`, and at the edge pixel centres `norm` is exactly
  // 0 or 1 in exact arithmetic, so whether an edge pixel wraps to the opposite side is decided by rounding. Headed
  // Firefox on Mesa (the Linux CI container) rounds the editor and the runtime to opposite sides on the top row, the
  // bottom row and the right column of the photo fixture: 0.377% of pixels, all on the edge in the review image, nothing
  // inside over 8 levels. Chromium, WebKit and Firefox on macOS agree there. Parity compares the frame without that ring.
  parityInset: 1,
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      { from: { track: 'step', fps: 6, stride: 337 }, to: { pass: 0, field: 'seedOffset' }, mode: 'add' },
      {
        from: { track: 'pulse', at: [0.2, 0.7], length: 0.08 },
        to: { pass: 0, field: 'dataMosh' },
        range: [0, 40],
        mode: 'add',
        clamp: [0, 100],
      },
      {
        from: { input: 'click' },
        to: { pass: 0, field: 'dataMosh' },
        range: [0, 50],
        mode: 'add',
        clamp: [0, 100],
      },
    ],
  },
});
