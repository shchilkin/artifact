import { defineEffectCase, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Grain at 40%. A step track adds 1 to the seed 18 times a second, so the grain boils: each step draws a new field
 * with the same distribution. Over the 4 s loop that is 72 steps, and each sampled loop position shows a different
 * field. Grain has no pointer binding.
 */
export default defineEffectCase({
  effect: 'grain',
  layer: { grain: 40 },
  frames: MOTION_FRAMES,
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [{ from: { track: 'step', fps: 18 }, to: { pass: 0, field: 'seedOffset' }, mode: 'add' }],
  },
});
