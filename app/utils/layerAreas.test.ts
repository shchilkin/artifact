import { describe, expect, it } from 'vitest';

import type { GraphArea, Layer } from '../types/config';
import { getLayerAreaMap } from './layerAreas';

describe('getLayerAreaMap', () => {
  const layers = [
    { id: 'image-1', kind: 'image', name: 'Image' },
    { id: 'text-1', kind: 'text', name: 'Title' },
  ] as Layer[];

  const areas: GraphArea[] = [
    { id: 'area-1', name: 'Source', color: '#ff705f', nodeIds: ['image-1', 'merge-1'] },
    { id: 'area-2', name: 'Type', color: '#8d5cff', nodeIds: ['text-1', 'image-1'] },
  ];

  it('maps only layer-backed nodes to their first graph area', () => {
    const map = getLayerAreaMap(layers, areas);

    expect(map.get('image-1')?.map((area) => area.name)).toEqual(['Source']);
    expect(map.get('text-1')?.map((area) => area.name)).toEqual(['Type']);
    expect(map.has('merge-1')).toBe(false);
  });

  it('handles documents without areas', () => {
    expect(getLayerAreaMap(layers, undefined).size).toBe(0);
  });
});
