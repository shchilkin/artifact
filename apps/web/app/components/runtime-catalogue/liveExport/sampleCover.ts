import type { BindingsDocument } from '../../../../../../packages/runtime/src/bindings';
import {
  type CanvasDocument,
  DEFAULT_EXPORT,
  DEFAULT_GLOBAL,
  DOCUMENT_SCHEMA_VERSION,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeImageLayer,
  makeTextLayer,
} from '../../../types/config';

/**
 * A small cover with the Вайбер cover's structure: a fill, emoji, an effect run (Glitch, Grain, Noise Warp, Vortex), an image
 * and text above it. The live-package harness and the catalogue export it; which effects end up live follows the
 * runtime registry.
 */
export function sampleLiveCover(imageSrc: string): CanvasDocument {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    global: { ...DEFAULT_GLOBAL, bg: 'transparent', seed: 4242, aspect: '1:1' },
    layers: [
      makeFillLayer({ id: 'sample-fill', color: '#5e30eb' }),
      makeEmojiLayer({ id: 'sample-emoji', density: 100, minSz: 44, maxSz: 106 }),
      makeEffectPresetLayer('glitch', { id: 'sample-glitch', glitch: 24 }),
      makeEffectPresetLayer('grain', { id: 'sample-grain', grain: 60 }),
      makeEffectPresetLayer('noiseWarp', { id: 'sample-warp', noiseWarp: 100 }),
      makeEffectPresetLayer('vortex', { id: 'sample-vortex', vortex: 20 }),
      makeImageLayer(imageSrc, {
        id: 'sample-image',
        name: 'Image',
        fit: 'free',
        scaleX: 0.4,
        scaleY: 0.4,
        x: 0.7,
        y: 0.7,
      }),
      makeTextLayer({
        id: 'sample-title',
        name: 'Title',
        content: 'ВАЙБЕР',
        color: '#ffffff',
        y: 0.15,
        scaleX: 1.4,
        scaleY: 1.4,
      }),
    ],
    export: DEFAULT_EXPORT,
  };
}

/** Loop length of `sampleLayerBindings`. */
export const SAMPLE_LAYER_LOOP_SECONDS = 4;

/**
 * Bindings for the sample cover that address layers (issue #429), by name and by id: the pointer moves every plate by
 * its depth and the Vortex centre; a wave sways Noise Warp's amount and breathes the Title's scale. Every binding is
 * neutral at t = 0 with the pointer centred, so the resting frame is the still. The Title scale moves the Image too
 * unless the export puts the Title on a plate of its own (`separate: ['Title']`).
 */
export function sampleLayerBindings(): BindingsDocument {
  return {
    version: 1,
    loop: { durationSeconds: SAMPLE_LAYER_LOOP_SECONDS },
    bindings: [
      { from: { input: 'pointer.x' }, to: { parallax: 'x' }, range: [-0.04, 0.04] },
      { from: { input: 'pointer.y' }, to: { parallax: 'y' }, range: [-0.04, 0.04] },
      { from: { input: 'pointer.x' }, to: { layer: 'sample-vortex', uniform: 'uCenter', component: 0 } },
      { from: { input: 'pointer.y' }, to: { layer: 'sample-vortex', uniform: 'uCenter', component: 1 } },
      { from: { track: 'wave' }, to: { layer: 'Noise Warp', field: 'noiseWarp' }, range: [-60, 60], mode: 'add' },
      { from: { track: 'wave', phase: 0.75 }, to: { layer: 'Title', transform: 'scale' }, range: [1, 1.06] },
    ],
  };
}
