import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Liquid Morph at 20%, frequency 5. Over a 4 s loop one wave flows the surface through `seedOffset` (±600, which the
 * shader scales by 0.00123 into the wave phases), starting a quarter-turn in so `t = 0` and `t = 0.5` sit at opposite
 * ends of the flow. A second wave breathes the frequency between 3 and 7, so the four loop positions all differ.
 * Pointer speed raises the amount; with the pointer still, the pointer frames match the authored `t = 0` frame.
 */
export default defineEffectCase({
  effect: 'morph',
  layer: { morphAmt: 20, morphFreq: 5 },
  frames: [...MOTION_FRAMES, ...INPUT_FRAMES],
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      {
        from: { track: 'wave', cycles: 1, phase: 0.25 },
        to: { pass: 0, field: 'seedOffset' },
        range: [-600, 600],
        mode: 'add',
      },
      { from: { track: 'wave', cycles: 1 }, to: { pass: 0, field: 'morphFreq' }, range: [-2, 2], mode: 'add' },
      {
        from: { input: 'pointer.speed' },
        to: { pass: 0, field: 'morphAmt' },
        range: [0, 40],
        mode: 'add',
        clamp: [0, 100],
      },
    ],
  },
});
