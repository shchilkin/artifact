import { BARREL_FRAG } from '@artifact/shared/effect-shaders';
import { defineEffect } from '../registry.js';

export interface BarrelLayer {
  readonly barrel: number;
  readonly seedOffset?: number;
}

/**
 * Barrel, running the editor's fragment unchanged with the editor's uniform mapping (`uK = barrel × 0.04`). The lens
 * centre is `uCenter`, which the registry defaults to the middle of the frame, as the editor passes it.
 */
export const barrel = defineEffect<BarrelLayer>({
  id: 'barrel',
  fragment: BARREL_FRAG,
  fields: ['barrel'],
  amount: (layer) => layer.barrel,
  uniforms: (layer) => ({ uK: layer.barrel * 0.04 }),
  centered: true,
  stochastic: false,
});
