import { VIGNETTE_FRAG } from '@artifact/shared/effect-shaders';
import { defineEffect } from '../registry.js';

export interface VignetteLayer {
  readonly vignette: number;
  readonly seedOffset?: number;
}

/**
 * Vignette, running the editor's fragment unchanged with the editor's uniform mapping. The light spot is centred on
 * `uCenter`, which the registry defaults to the middle of the frame, as the editor passes it.
 */
export const vignette = defineEffect<VignetteLayer>({
  id: 'vignette',
  fragment: VIGNETTE_FRAG,
  fields: ['vignette'],
  amount: (layer) => layer.vignette,
  uniforms: (layer) => ({ uIntensity: layer.vignette * 0.01 }),
  centered: true,
  stochastic: false,
});
