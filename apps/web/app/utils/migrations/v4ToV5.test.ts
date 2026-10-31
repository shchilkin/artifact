import { describe, expect, it } from 'vitest';
import { EXPORT_NODE_ID } from '../../types/linearGraph';
import { migrateV4ToV5 } from './v4ToV5';

describe('migrateV4ToV5', () => {
  it('gives a plain layer stack its linear graph', () => {
    const doc = migrateV4ToV5({
      schemaVersion: 4,
      layers: [
        { id: 'fill', kind: 'fill' },
        { id: 'grain', kind: 'effect' },
        { id: 'title', kind: 'text' },
        'not a layer',
      ],
    });

    const graph = doc.graph as { edges: { fromId: string; toId: string; toPort: string }[] };
    expect(doc.schemaVersion).toBe(5);
    expect(graph.edges.map(({ fromId, toId, toPort }) => `${fromId}->${toId}:${toPort}`)).toEqual([
      'fill->grain:in',
      'grain->title:bg',
      `title->${EXPORT_NODE_ID}:in`,
    ]);
  });

  it('gives an empty document an empty graph', () => {
    const doc = migrateV4ToV5({ schemaVersion: 4, layers: [] });
    expect(doc.graph).toMatchObject({ edges: [], positions: { [EXPORT_NODE_ID]: { x: 0, y: 80 } } });
  });

  it('keeps an existing graph untouched', () => {
    const graph = { edges: [], positions: {}, mergeNodes: [], colorNodes: [] };
    const doc = migrateV4ToV5({ schemaVersion: 4, layers: [{ id: 'fill', kind: 'fill' }], graph });
    expect(doc.graph).toBe(graph);
  });
});
