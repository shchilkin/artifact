import { describe, expect, it } from 'vitest';

import { type CanvasDocument, makeEffectPresetLayer, makeFillLayer, makeImageLayer } from '../types/config';
import { createLayerPreviewRenderCache } from './layerPreviewRenderCache';
import { EXPORT_NODE_ID } from './nodeGraph';

function makeDoc(layers: CanvasDocument['layers']): CanvasDocument {
  return {
    global: { bg: '#120020', seed: 7, aspect: '1:1' },
    layers,
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

describe('createLayerPreviewRenderCache', () => {
  it('keeps lower stack cache keys when only an upper layer changes', () => {
    const fill = makeFillLayer({ id: 'base-fill', color: '#ff0000' });
    const effect = makeEffectPresetLayer('grain', { id: 'grain', grain: 12 });
    const editedEffect = { ...effect, grain: 32 };
    const entries = new Map<string, Promise<HTMLCanvasElement>>();

    const before = createLayerPreviewRenderCache(makeDoc([fill, effect]), new Map(), entries, {
      width: 540,
      height: 540,
      renderOptions: { draft: false, skipEffects: false },
    });
    const after = createLayerPreviewRenderCache(makeDoc([fill, editedEffect]), new Map(), entries, {
      width: 540,
      height: 540,
      renderOptions: { draft: false, skipEffects: false },
    });

    expect(before.entryKey?.('base-fill')).toBe(after.entryKey?.('base-fill'));
    expect(before.entryKey?.('grain')).not.toBe(after.entryKey?.('grain'));
    expect(before.entryKey?.(EXPORT_NODE_ID)).not.toBe(after.entryKey?.(EXPORT_NODE_ID));
  });

  it('invalidates image layers when image readiness changes', () => {
    const imageLayer = makeImageLayer('artifact-asset://cover', { id: 'cover' });
    const entries = new Map<string, Promise<HTMLCanvasElement>>();
    const missing = createLayerPreviewRenderCache(makeDoc([imageLayer]), new Map(), entries, {
      width: 540,
      height: 540,
      renderOptions: { draft: false, skipEffects: false },
    });
    const loaded = createLayerPreviewRenderCache(
      makeDoc([imageLayer]),
      new Map([
        [
          'artifact-asset://cover',
          {
            naturalWidth: 1024,
            naturalHeight: 768,
          } as HTMLImageElement,
        ],
      ]),
      entries,
      {
        width: 540,
        height: 540,
        renderOptions: { draft: false, skipEffects: false },
      },
    );

    expect(missing.entryKey?.('cover')).not.toBe(loaded.entryKey?.('cover'));
  });
});
