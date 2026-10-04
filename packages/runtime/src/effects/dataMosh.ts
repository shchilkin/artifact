import { DATAMOSH_FRAG } from '@artifact/shared/effect-shaders';
import { defineEffect, effectLayerSeed } from '../registry.js';

export interface DataMoshLayer {
  readonly dataMosh: number;
  readonly seedOffset?: number;
}

/**
 * Data Mosh, running the editor's fragment unchanged with the editor's uniform mapping. The seed picks which blocks
 * shift, so binding `seedOffset` re-moshes the frame. At a fixed seed the GPU fragment is the editor's own, so parity
 * is judged by pixels, not statistics.
 */
export const dataMosh = defineEffect<DataMoshLayer>({
  id: 'dataMosh',
  fragment: DATAMOSH_FRAG,
  fields: ['dataMosh', 'seedOffset'],
  amount: (layer) => layer.dataMosh,
  uniforms: (layer, context) => ({
    uIntensity: layer.dataMosh * 0.007,
    uSeed: effectLayerSeed(context, layer),
  }),
  centered: false,
  stochastic: false,
});
