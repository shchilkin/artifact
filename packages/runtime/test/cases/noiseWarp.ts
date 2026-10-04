import { defineEffectCase, INPUT_FRAMES, MOTION_FRAMES } from '../../src/testing/effectCase.js';

/**
 * Noise Warp at 90%. Until the bindings of issue #332 land, the time and pointer response below stands in for an
 * authored binding: time and pointer position move the noise field, pointer speed strengthens the warp.
 */
export default defineEffectCase({
  effect: 'noiseWarp',
  layer: { noiseWarp: 90 },
  frames: [...MOTION_FRAMES, ...INPUT_FRAMES],
  frameUniforms: ({ time, inputs }, pass) => {
    const seed = Number(pass.uniforms.uSeed ?? 0);
    const intensity = Number(pass.uniforms.uIntensity ?? 0);
    return {
      uSeed: seed + time * 400 + (inputs['pointer.x'] ?? 0) * 300 + (inputs['pointer.y'] ?? 0) * 500,
      uIntensity: intensity * (1 + (inputs['pointer.speed'] ?? 0) * 1.5),
    };
  },
});
