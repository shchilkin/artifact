import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Pixelate at 12px blocks. Over a 4 s loop one wave, eased in and out, adds up to 24px to the block size: the cover
 * starts at its blockiest (36px at t = 0), resolves to the authored blocks at t = 0.5 and closes the loop back (24px at
 * t = 0.25 and 0.75). The reveal follows the pointer (`pointer.x/y` → `uCenter`), and hovering opens it
 * (`hover` → `pixelateRadius`, up to a quarter of the width, with the default band): sharp around the pointer, blockier
 * in rings with distance. The pointer frames hover at the centre and in the bottom-right corner. At rest the hover is
 * 0, so the radius is 0 and the authored still is the editor's.
 */
export default defineEffectCase({
  effect: 'pixelate',
  layer: { pixelate: 12 },
  frames: [
    ...MOTION_FRAMES,
    ...INPUT_FRAMES.filter((frame) => frame.name !== 'pointer-speed').map((frame) => ({
      ...frame,
      t: 0.5,
      input: { ...frame.input, hover: 1 },
    })),
  ],
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      {
        from: { track: 'wave', cycles: 1, phase: 0.25 },
        to: { pass: 0, field: 'pixelate' },
        range: [0, 24],
        easing: 'easeInOut',
        mode: 'add',
      },
      { from: { input: 'pointer.x' }, to: { pass: 0, uniform: 'uCenter', component: 0 } },
      { from: { input: 'pointer.y' }, to: { pass: 0, uniform: 'uCenter', component: 1 } },
      { from: { input: 'hover' }, to: { pass: 0, field: 'pixelateRadius' }, range: [0, 0.25], easing: 'easeOut' },
    ],
  },
});
