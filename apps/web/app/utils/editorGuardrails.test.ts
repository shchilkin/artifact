import { describe, expect, it } from 'vitest';
import type { CanvasDocument } from '../types/config';
import { makeFillLayer, makeTextLayer } from '../types/config';
import { canReorderDocumentLayers, getLayerGuardrailState, getNodeGuardrailState } from './editorGuardrails';

describe('editor guardrails', () => {
  it('keeps unlocked layers editable, deletable, and reorderable', () => {
    const layer = makeFillLayer({ id: 'fill', locked: false });

    expect(getLayerGuardrailState(layer)).toMatchObject({
      locked: false,
      canDelete: true,
      canReorder: true,
      canEditControls: true,
      canToggleVisibility: true,
      reason: null,
    });
  });

  it('protects locked layers from delete and layer-stack reorder only', () => {
    const layer = makeFillLayer({ id: 'fill', locked: true });

    expect(getLayerGuardrailState(layer)).toMatchObject({
      locked: true,
      canDelete: false,
      canReorder: false,
      canEditControls: true,
      canToggleVisibility: true,
      reason: 'Locked layer targets are protected from delete actions and layer-stack reorder.',
    });
  });

  it('applies locked layer guardrails to layer-backed nodes', () => {
    const doc = {
      global: { bg: '#000000', seed: 1, aspect: '1:1' },
      layers: [makeFillLayer({ id: 'locked-fill', locked: true })],
      export: { format: 'png', scale: 1, target: 'cover' },
    } satisfies CanvasDocument;

    expect(getNodeGuardrailState(doc, 'locked-fill')).toMatchObject({
      locked: true,
      layerBacked: true,
      canDelete: false,
      canEditControls: true,
      canMoveNode: true,
    });
  });

  it('keeps graph-only node locking deferred in v0.28', () => {
    const doc = {
      global: { bg: '#000000', seed: 1, aspect: '1:1' },
      layers: [],
      export: { format: 'png', scale: 1, target: 'cover' },
    } satisfies CanvasDocument;

    expect(getNodeGuardrailState(doc, 'merge-a')).toMatchObject({
      locked: false,
      layerBacked: false,
      canDelete: true,
      canMoveNode: true,
    });
  });

  it('blocks reorder only when a locked layer changes index', () => {
    const locked = makeFillLayer({ id: 'locked', locked: true });
    const free = makeTextLayer({ id: 'free' });

    expect(canReorderDocumentLayers([locked, free], [locked, free])).toBe(true);
    expect(canReorderDocumentLayers([locked, free], [free, locked])).toBe(false);
  });
});
