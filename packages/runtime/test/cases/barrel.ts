import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Barrel at 40%. Over a 6 s loop one slow wave breathes the bulge by ±15. Its phase of 1/16 turn keeps the four loop
 * positions apart (about 46, 54, 34 and 26%), so each motion golden differs. The lens centre follows the pointer
 * through `uCenter`, and hovering bulges harder, so the pointer frames hover at the centre and in the bottom-right
 * corner. With the pointer resting at the centre and no hover, the pointer bindings leave the authored still unchanged.
 */
export default defineEffectCase({
  effect: 'barrel',
  layer: { barrel: 40 },
  frames: [
    ...MOTION_FRAMES,
    ...INPUT_FRAMES.filter((frame) => frame.name !== 'pointer-speed').map((frame) => ({
      ...frame,
      input: { ...frame.input, hover: 1 },
    })),
  ],
  bindings: {
    version: 1,
    loop: { durationSeconds: 6 },
    bindings: [
      {
        from: { track: 'wave', cycles: 1, phase: 0.0625 },
        to: { pass: 0, field: 'barrel' },
        range: [-15, 15],
        mode: 'add',
      },
      { from: { input: 'pointer.x' }, to: { pass: 0, uniform: 'uCenter', component: 0 } },
      { from: { input: 'pointer.y' }, to: { pass: 0, uniform: 'uCenter', component: 1 } },
      {
        from: { input: 'hover' },
        to: { pass: 0, field: 'barrel' },
        range: [0, 40],
        easing: 'easeOut',
        mode: 'add',
        clamp: [0, 100],
      },
    ],
  },
});
