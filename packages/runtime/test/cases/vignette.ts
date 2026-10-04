import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Vignette at 60%, as a torch in the dark. Over a 4 s loop two fast, low waves flicker the amount: 13 cycles of ±5
 * and 37 cycles of ±3 (about 3 and 9 Hz), so the light never settles. Both waves start at zero, so `t = 0` and
 * `t = 0.5` sit at the authored 60% (their goldens match); `t = 0.25` is at 69% and `t = 0.75` at 51%. The light spot
 * follows the pointer through `uCenter`, and hovering deepens the dark around it, so the pointer frames hover at the
 * centre and in the bottom-right corner. With the pointer resting at the centre and no hover, the pointer bindings
 * leave the authored still unchanged.
 */
export default defineEffectCase({
  effect: 'vignette',
  layer: { vignette: 60 },
  frames: [
    ...MOTION_FRAMES,
    ...INPUT_FRAMES.filter((frame) => frame.name !== 'pointer-speed').map((frame) => ({
      ...frame,
      input: { ...frame.input, hover: 1 },
    })),
  ],
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      { from: { track: 'wave', cycles: 13 }, to: { pass: 0, field: 'vignette' }, range: [-5, 5], mode: 'add' },
      { from: { track: 'wave', cycles: 37 }, to: { pass: 0, field: 'vignette' }, range: [-3, 3], mode: 'add' },
      { from: { input: 'pointer.x' }, to: { pass: 0, uniform: 'uCenter', component: 0 } },
      { from: { input: 'pointer.y' }, to: { pass: 0, uniform: 'uCenter', component: 1 } },
      {
        from: { input: 'hover' },
        to: { pass: 0, field: 'vignette' },
        range: [0, 30],
        easing: 'easeOut',
        mode: 'add',
        clamp: [0, 100],
      },
    ],
  },
});
