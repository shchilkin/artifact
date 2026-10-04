import { VORTEX_FRAG } from '@artifact/shared/effect-shaders';
import { defineEffect } from '../registry.js';

export interface VortexLayer {
  readonly vortex: number;
  readonly seedOffset?: number;
}

/**
 * Vortex, running the editor's fragment unchanged with the editor's uniform mapping. The swirl centre is `uCenter`,
 * which the registry defaults to the middle of the frame, as the editor passes it.
 */
export const vortex = defineEffect<VortexLayer>({
  id: 'vortex',
  fragment: VORTEX_FRAG,
  fields: ['vortex'],
  amount: (layer) => layer.vortex,
  uniforms: (layer) => ({ uIntensity: layer.vortex * 0.03 }),
  centered: true,
  stochastic: false,
});
