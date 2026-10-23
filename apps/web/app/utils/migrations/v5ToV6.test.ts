import { describe, expect, it } from 'vitest';
import { migrateV5ToV6 } from './v5ToV6';

describe('migrateV5ToV6', () => {
  it('moves per-kind node arrays into a nodes map with kinds', () => {
    const doc = migrateV5ToV6({
      schemaVersion: 5,
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [{ id: 'merge-a', name: 'Merge', blendMode: 'screen', opacity: 50 }],
        colorNodes: [],
        shaderNodes: [{ id: 'shader-a', shaderKind: 'waves' }],
        grimeShadowNodes: [{ id: 'shadow-a', grime: 30 }, 'not a node'],
        areas: [{ id: 'area', nodeIds: ['merge-a'] }],
      },
    });

    expect(doc.schemaVersion).toBe(6);
    expect(doc.graph).toEqual({
      edges: [],
      positions: {},
      areas: [{ id: 'area', nodeIds: ['merge-a'] }],
      nodes: {
        'merge-a': { kind: 'merge', id: 'merge-a', name: 'Merge', blendMode: 'screen', opacity: 50 },
        'shadow-a': { kind: 'grimeShadow', id: 'shadow-a', grime: 30 },
        'shader-a': { kind: 'shader', id: 'shader-a', shaderKind: 'waves' },
      },
    });
  });

  it('keeps the first kind when two nodes share an id, as the renderer did', () => {
    const doc = migrateV5ToV6({
      graph: {
        mergeNodes: [{ id: 'twin', name: 'Merge' }],
        shaderNodes: [{ id: 'twin', name: 'Shader' }],
      },
    });
    expect(doc.graph).toEqual({ nodes: { twin: { kind: 'merge', id: 'twin', name: 'Merge' } } });
  });

  it('only bumps the version when there is no graph', () => {
    expect(migrateV5ToV6({ layers: [] })).toEqual({ layers: [], schemaVersion: 6 });
  });
});
