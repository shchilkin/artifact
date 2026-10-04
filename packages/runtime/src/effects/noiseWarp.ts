import { NOISE_FRAG } from '@artifact/shared/effect-shaders';
import { defineEffect, effectLayerSeed } from '../registry.js';

export interface NoiseWarpLayer {
  readonly noiseWarp: number;
  readonly seedOffset?: number;
}

/** Noise Warp, running the editor's fragment unchanged with the editor's uniform mapping. */
export const noiseWarp = defineEffect<NoiseWarpLayer>({
  id: 'noiseWarp',
  fragment: NOISE_FRAG,
  fields: ['noiseWarp', 'seedOffset'],
  amount: (layer) => layer.noiseWarp,
  uniforms: (layer, context) => ({
    uIntensity: layer.noiseWarp * 0.0008,
    uSeed: effectLayerSeed(context, layer),
  }),
  centered: false,
  stochastic: false,
});
