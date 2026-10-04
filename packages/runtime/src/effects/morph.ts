import { MORPH_FRAG } from '@artifact/shared/effect-shaders';
import { defineEffect, effectLayerSeed } from '../registry.js';

export interface MorphLayer {
  readonly morphAmt: number;
  readonly morphFreq: number;
  readonly seedOffset?: number;
}

/**
 * Liquid Morph, running the editor's fragment unchanged with the editor's uniform mapping. The shader phases its
 * waves by `uSeed * 0.00123`, so driving `seedOffset` makes the surface flow.
 */
export const morph = defineEffect<MorphLayer>({
  id: 'morph',
  fragment: MORPH_FRAG,
  fields: ['morphAmt', 'morphFreq', 'seedOffset'],
  amount: (layer) => layer.morphAmt,
  uniforms: (layer, context) => ({
    uIntensity: layer.morphAmt * 0.05,
    uFreq: layer.morphFreq,
    uSeed: effectLayerSeed(context, layer),
  }),
  centered: false,
  stochastic: false,
});
