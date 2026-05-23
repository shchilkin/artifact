import { describe, expect, it } from 'vitest';
import { computeNextLayerSelection } from './useLayerSelection';

function ids(set: Set<string>) {
  return [...set];
}

describe('computeNextLayerSelection', () => {
  const orderedLayerIds = ['top', 'middle', 'bottom'];

  it('selects a single layer and stores it as the range anchor', () => {
    const next = computeNextLayerSelection({
      id: 'middle',
      orderedLayerIds,
      currentSelectedIds: new Set(),
      selectedLayerId: null,
      anchorId: null,
      modifiers: { shiftKey: false, metaKey: false, ctrlKey: false },
    });

    expect(ids(next.selectedIds)).toEqual(['middle']);
    expect(next.anchorId).toBe('middle');
    expect(next.activeLayerId).toBe('middle');
  });

  it('toggles meta selections and falls back to the last selected layer', () => {
    const next = computeNextLayerSelection({
      id: 'middle',
      orderedLayerIds,
      currentSelectedIds: new Set(['top', 'middle']),
      selectedLayerId: 'middle',
      anchorId: 'middle',
      modifiers: { shiftKey: false, metaKey: true, ctrlKey: false },
    });

    expect(ids(next.selectedIds)).toEqual(['top']);
    expect(next.anchorId).toBe('middle');
    expect(next.activeLayerId).toBe('top');
  });

  it('selects inclusive ranges from the anchor in display order', () => {
    const next = computeNextLayerSelection({
      id: 'bottom',
      orderedLayerIds,
      currentSelectedIds: new Set(['top']),
      selectedLayerId: 'top',
      anchorId: 'top',
      modifiers: { shiftKey: true, metaKey: false, ctrlKey: false },
    });

    expect(ids(next.selectedIds)).toEqual(['top', 'middle', 'bottom']);
    expect(next.anchorId).toBe('top');
    expect(next.activeLayerId).toBe('bottom');
  });
});
