import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Radial chromatic aberration at 15 px. Over a 4 s loop a gentle wave breathes the fringe between 10 and 20 px
 * (t = 0 and t = 0.5 sit at the authored 15). The fringe centre follows the pointer through `uCenter`, and pointer
 * speed widens the fringe by up to 15 px. With the pointer resting at the centre and still, the pointer bindings
 * leave the authored still unchanged.
 */
export default defineEffectCase({
  effect: 'ca',
  layer: { ca: 15 },
  frames: [...MOTION_FRAMES, ...INPUT_FRAMES],
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      { from: { track: 'wave', cycles: 1 }, to: { pass: 0, field: 'ca' }, range: [-5, 5], mode: 'add' },
      { from: { input: 'pointer.x' }, to: { pass: 0, uniform: 'uCenter', component: 0 } },
      { from: { input: 'pointer.y' }, to: { pass: 0, uniform: 'uCenter', component: 1 } },
      {
        from: { input: 'pointer.speed' },
        to: { pass: 0, field: 'ca' },
        range: [0, 15],
        mode: 'add',
        clamp: [0, 30],
      },
    ],
  },
});
