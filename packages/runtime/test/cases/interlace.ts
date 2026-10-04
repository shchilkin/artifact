import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Interlace at 20. Over a 4 s loop a step track re-seeds the rows ten times a second (40 steps, so the loop closes);
 * the shader adds `uSeed * 0.007` to the phase of each row's hash, so a stride of 100 moves it by 0.7 rad and every
 * sampled loop position shifts the rows by different amounts. Pointer speed raises the amount by up to 40, so a fast
 * pointer tears the rows further apart; the `pointer-speed` frame records full speed. Interlace has no
 * pointer-position binding, so the centre and corner frames match `t-0`.
 */
export default defineEffectCase({
  effect: 'interlace',
  layer: { interlace: 20 },
  frames: [...MOTION_FRAMES, ...INPUT_FRAMES],
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      { from: { track: 'step', fps: 10, stride: 100 }, to: { pass: 0, field: 'seedOffset' }, mode: 'add' },
      {
        from: { input: 'pointer.speed' },
        to: { pass: 0, field: 'interlace' },
        range: [0, 40],
        mode: 'add',
        clamp: [0, 100],
      },
    ],
  },
});
