import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Noise Warp at 90%. Over a 4 s loop one wave drifts the noise field and a quarter-turn later wave breathes the
 * strength, so each sampled loop position differs. The pointer position moves the field and pointer speed
 * strengthens the warp; with the pointer centred and still the pointer bindings add nothing.
 */
export default defineEffectCase({
  effect: 'noiseWarp',
  layer: { noiseWarp: 90 },
  frames: [...MOTION_FRAMES, ...INPUT_FRAMES],
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      { from: { track: 'wave', cycles: 1 }, to: { pass: 0, field: 'seedOffset' }, range: [-200, 200], mode: 'add' },
      {
        from: { track: 'wave', cycles: 1, phase: 0.25 },
        to: { pass: 0, field: 'noiseWarp' },
        range: [-20, 20],
        mode: 'add',
      },
      { from: { input: 'pointer.x' }, to: { pass: 0, uniform: 'uSeed' }, range: [-150, 150], mode: 'add' },
      { from: { input: 'pointer.y' }, to: { pass: 0, uniform: 'uSeed' }, range: [-250, 250], mode: 'add' },
      { from: { input: 'pointer.speed' }, to: { pass: 0, field: 'noiseWarp' }, range: [0, 60], mode: 'add' },
    ],
  },
});
