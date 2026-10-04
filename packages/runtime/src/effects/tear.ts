import { TEAR_FRAG } from '@artifact/shared/effect-shaders';
import { defineEffect, effectLayerSeed } from '../registry.js';

export interface TearLayer {
  readonly tearAmt: number;
  readonly tearSize: number;
  readonly seedOffset?: number;
}

/**
 * Chunk Tear, running the editor's fragment unchanged with the editor's uniform mapping. The torn bands are a hash of
 * the seed, so binding `seedOffset` re-tears the frame. At a fixed seed the GPU fragment is the editor's own, so
 * parity is judged by pixels, not statistics.
 */
export const tear = defineEffect<TearLayer>({
  id: 'tear',
  fragment: TEAR_FRAG,
  fields: ['tearAmt', 'tearSize', 'seedOffset'],
  amount: (layer) => layer.tearAmt,
  uniforms: (layer, context) => ({
    uIntensity: layer.tearAmt * 0.007,
    uChunkH: layer.tearSize / 1000,
    uSeed: effectLayerSeed(context, layer),
  }),
  centered: false,
  stochastic: false,
});
