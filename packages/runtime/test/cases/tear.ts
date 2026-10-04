import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Chunk Tear at 10 with 6px bands. Over a 4 s loop a step track re-seeds the tear eight times a second (32 steps, so
 * the loop closes), so every sampled loop position tears different bands. A click spikes the tear amount, decaying
 * with the click input; the `click` frame records the press. Tear has no pointer-position or speed binding, so the
 * pointer frames match `t-0`.
 */
export default defineEffectCase({
  effect: 'tear',
  layer: { tearAmt: 10, tearSize: 6 },
  frames: [...MOTION_FRAMES, ...INPUT_FRAMES, { name: 'click', t: 0, input: { click: 1 } }],
  // The editor's fragment wraps the sample with `fract(norm.x + offset)`. At the last column's pixel centre `norm.x` is
  // exactly 1 in exact arithmetic. Pixi's power-of-two filter texture makes it exactly 1.0 in Chromium, so untorn
  // rows of the editor's last column wrap to the left edge; the runtime's 540-texel texture lands a hair under 1.0
  // and keeps the right edge. Everything else matches exactly (0 other pixels over 8 levels), but on the photo
  // fixture that one column is 0.105% of the frame, so allow one column (1/540 = 0.185%).
  pixelTolerance: { maxDifferentRatio: 0.002 },
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      { from: { track: 'step', fps: 8, stride: 37 }, to: { pass: 0, field: 'seedOffset' }, mode: 'add' },
      { from: { input: 'click' }, to: { pass: 0, field: 'tearAmt' }, range: [0, 10], mode: 'add', clamp: [0, 20] },
    ],
  },
});
