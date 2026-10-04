import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Vortex at 50%. Over a 4 s loop one wave breathes the twist (75% at t = 0.25, 25% at t = 0.75; t = 0 and t = 0.5
 * sit at the authored 50%, so their goldens match). The swirl centre follows the pointer through
 * `uCenter`, and hovering twists harder, so the pointer frames hover at the centre and in the bottom-right corner.
 * With the pointer resting at the centre and no hover, the pointer bindings leave the authored still unchanged.
 */
export default defineEffectCase({
  effect: 'vortex',
  layer: { vortex: 50 },
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
      { from: { track: 'wave', cycles: 1 }, to: { pass: 0, field: 'vortex' }, range: [-25, 25], mode: 'add' },
      { from: { input: 'pointer.x' }, to: { pass: 0, uniform: 'uCenter', component: 0 } },
      { from: { input: 'pointer.y' }, to: { pass: 0, uniform: 'uCenter', component: 1 } },
      {
        from: { input: 'hover' },
        to: { pass: 0, field: 'vortex' },
        range: [0, 40],
        easing: 'easeOut',
        mode: 'add',
        clamp: [0, 100],
      },
    ],
  },
});
