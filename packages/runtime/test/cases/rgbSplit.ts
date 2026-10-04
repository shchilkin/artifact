import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Chromatic split at 8 (the editor preset's value): an 8 px whole-pixel offset, then the GPU filter's 2.6 px shift at
 * 540px. Over a 4 s loop a gentle wave pulses the split between 5 and 11 (t = 0 and t = 0.5 sit at the authored 8).
 * Pointer speed widens it by up to 16, and the split turns to the pointer's heading (`pointer.dirX/dirY` drive the
 * runtime-only direction fields). The pointer at rest has no heading, so the split keeps the editor's diagonal and
 * the pointer bindings leave the authored still unchanged. `pointer-speed-left` is a fast pointer moving left.
 */
export default defineEffectCase({
  effect: 'rgbSplit',
  layer: { rgbSplit: 8 },
  frames: [
    ...MOTION_FRAMES,
    ...INPUT_FRAMES,
    {
      name: 'pointer-speed-left',
      t: 0,
      input: { 'pointer.x': 0.5, 'pointer.y': 0.5, 'pointer.speed': 1, 'pointer.dirX': -1, 'pointer.dirY': 0 },
    },
  ],
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      { from: { track: 'wave', cycles: 1 }, to: { pass: 0, field: 'rgbSplit' }, range: [-3, 3], mode: 'add' },
      {
        from: { input: 'pointer.speed' },
        to: { pass: 0, field: 'rgbSplit' },
        range: [0, 16],
        mode: 'add',
        clamp: [0, 40],
      },
      { from: { input: 'pointer.dirX' }, to: { pass: 0, field: 'rgbSplitDirX' } },
      { from: { input: 'pointer.dirY' }, to: { pass: 0, field: 'rgbSplitDirY' } },
    ],
  },
});
