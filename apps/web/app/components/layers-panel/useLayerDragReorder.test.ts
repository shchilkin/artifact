import { describe, expect, it } from 'vitest';
import { type Layer, makeFillLayer } from '../../types/config';
import { reorderDisplayLayersForDrop } from './useLayerDragReorder';

const a = makeFillLayer({ id: 'a', name: 'A' });
const b = makeFillLayer({ id: 'b', name: 'B' });
const c = makeFillLayer({ id: 'c', name: 'C' });
const d = makeFillLayer({ id: 'd', name: 'D' });

function ids(layers: Layer[]) {
  return layers.map((layer) => layer.id);
}

describe('reorderDisplayLayersForDrop', () => {
  it('moves a lower display row before an upper target', () => {
    expect(ids(reorderDisplayLayersForDrop([a, b, c, d], 'd', 'b', 'before'))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves an upper display row after a lower target', () => {
    expect(ids(reorderDisplayLayersForDrop([a, b, c, d], 'a', 'c', 'after'))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('keeps order stable for self or missing targets', () => {
    expect(ids(reorderDisplayLayersForDrop([a, b, c], 'b', 'b', 'after'))).toEqual(['a', 'b', 'c']);
    expect(ids(reorderDisplayLayersForDrop([a, b, c], 'x', 'b', 'after'))).toEqual(['a', 'b', 'c']);
    expect(ids(reorderDisplayLayersForDrop([a, b, c], 'b', 'x', 'after'))).toEqual(['a', 'b', 'c']);
  });
});
