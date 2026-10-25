import { describe, expect, it } from 'vitest';
import { migrateV17ToV18 } from './v17ToV18';

describe('migrateV17ToV18', () => {
  it('turns Grime Shadow nodes into Shadow effect layers after the layer feeding them', () => {
    const doc = migrateV17ToV18({
      schemaVersion: 17,
      layers: [
        { id: 'ground', kind: 'fill' },
        { id: 'title', kind: 'text' },
      ],
      graph: {
        edges: [
          { id: 'e1', fromId: 'ground', fromPort: 'out', toId: 'title', toPort: 'bg' },
          { id: 'e2', fromId: 'ground', fromPort: 'out', toId: 'shade', toPort: 'in' },
        ],
        positions: { shade: { x: 1, y: 2 } },
        nodes: {
          shade: { kind: 'grimeShadow', id: 'shade', name: 'Dirt', layers: 1, grime: 0, jitter: 0, hidden: true },
          merge: { kind: 'merge', id: 'merge' },
        },
      },
    });

    expect(doc.schemaVersion).toBe(18);
    expect((doc.graph as { nodes: object }).nodes).toEqual({ merge: { kind: 'merge', id: 'merge' } });
    expect((doc.layers as Array<{ id: string }>).map((layer) => layer.id)).toEqual(['ground', 'shade', 'title']);
    expect((doc.layers as unknown[])[1]).toMatchObject({
      id: 'shade',
      kind: 'effect',
      name: 'Dirt',
      visible: false,
      preset: 'grimeShadow',
      seedOffset: 0,
      effects: [
        {
          id: 'shade-shadow',
          effect: 'shadow',
          params: {
            mode: 'grime',
            opacity: 58,
            x: 8,
            y: 10,
            blur: 10,
            spread: 14,
            source: 'show',
            variation: 2912048522,
          },
        },
      ],
    });
  });

  it('only bumps the version without graph nodes', () => {
    expect(migrateV17ToV18({ layers: [] })).toEqual({ layers: [], schemaVersion: 18 });
  });
});
