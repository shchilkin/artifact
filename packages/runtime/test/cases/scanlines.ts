import { defineEffectCase, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Scanlines at 35% with 3 px lines (at 540px: 3 px line, 1 px gap). A step track at 30 fps moves the lines down by
 * 0.025 of a line period per step: 120 steps over the 4 s loop crawl exactly 3 periods, so the loop closes, and each
 * sampled loop position sits at a different phase (0, 0.75, 1.5 and 2.25 periods). Scrolling the page through the
 * artwork adds up to 2.5 periods on top, so the lines drift against the scroll; at scroll 0 it adds nothing.
 */
export default defineEffectCase({
  effect: 'scanlines',
  layer: { scanlines: 35, scanlineWidth: 3 },
  frames: [...MOTION_FRAMES, ...[0, 0.5, 1].map((scroll) => ({ name: `scroll-${scroll}`, t: 0, input: { scroll } }))],
  bindings: {
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      { from: { track: 'step', fps: 30, stride: 0.025 }, to: { pass: 0, uniform: 'uOffset' }, mode: 'add' },
      { from: { input: 'scroll' }, to: { pass: 0, uniform: 'uOffset' }, range: [0, 2.5], mode: 'add' },
    ],
  },
});
