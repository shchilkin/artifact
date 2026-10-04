import { INTERLACE_FRAG } from '@artifact/shared/effect-shaders';
import { defineEffect, effectLayerSeed } from '../registry.js';

export interface InterlaceLayer {
  readonly interlace: number;
  readonly seedOffset?: number;
}

/**
 * Interlace, running the editor's fragment unchanged with the editor's uniform mapping: `uIntensity = interlace ×
 * 0.003`, `uSeed` the document seed plus the layer offset, and `uResY` the render height, as the editor passes its
 * canvas height, so rows are whole pixel rows at any render size. The seed picks how far each row moves, so binding
 * `seedOffset` re-shifts every row. At a fixed seed the fragment is the editor's own, so parity is judged by pixels.
 */
export const interlace = defineEffect<InterlaceLayer>({
  id: 'interlace',
  fragment: INTERLACE_FRAG,
  fields: ['interlace', 'seedOffset'],
  amount: (layer) => layer.interlace,
  uniforms: (layer, context) => ({
    uIntensity: layer.interlace * 0.003,
    uSeed: effectLayerSeed(context, layer),
    uResY: context.height,
  }),
  centered: false,
  stochastic: false,
});
