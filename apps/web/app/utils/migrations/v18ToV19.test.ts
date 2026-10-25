import { describe, expect, it } from 'vitest';
import { migrateV18ToV19 } from './v18ToV19';

const prim = {
  id: 'prim',
  kind: 'primitive',
  name: 'Ball',
  opacity: 40,
  blendMode: 'screen',
  primitiveShape: 'sphere',
};

describe('migrateV18ToV19', () => {
  it('turns a 3D Scene into a 3D Object layer with the scene id, settings, and connections', () => {
    const doc = migrateV18ToV19({
      schemaVersion: 18,
      layers: [{ id: 'bg', kind: 'fill' }, prim, { id: 'clouds', kind: 'noise' }],
      graph: {
        edges: [
          { id: 'e1', fromId: 'bg', fromPort: 'out', toId: 'S', toPort: 'bg' },
          { id: 'e2', fromId: 'prim', fromPort: 'out', toId: 'S', toPort: 'model' },
          { id: 'e3', fromId: 'M', fromPort: 'out', toId: 'S', toPort: 'material' },
          { id: 'e4', fromId: 'clouds', fromPort: 'out', toId: 'E', toPort: 'in' },
          { id: 'e5', fromId: 'E', fromPort: 'out', toId: 'S', toPort: 'env' },
          { id: 'e6', fromId: 'S', fromPort: 'out', toId: '__export__', toPort: 'in' },
        ],
        positions: { S: { x: 1, y: 1 }, prim: { x: 0, y: 0 }, E: { x: 2, y: 2 } },
        nodes: {
          S: { kind: 'scene3d', id: 'S', name: 'Stage', exposure: 90, environmentSrc: 'legacy', hidden: true },
          E: { kind: 'environment', id: 'E', environmentSrc: 'artifact-env://sky', environmentName: 'sky.hdr' },
          M: { kind: 'material', id: 'M' },
        },
        areas: [{ id: 'a', nodeIds: ['S', 'prim', 'E'] }],
        primitiveViewStates: { S: { zoom: 2 }, prim: { zoom: 3 } },
      },
    });

    expect(doc.schemaVersion).toBe(19);
    expect(doc.layers).toEqual([
      { id: 'bg', kind: 'fill' },
      {
        ...prim,
        id: 'S',
        name: 'Stage',
        visible: false,
        opacity: 100,
        blendMode: 'normal',
        scene: expect.objectContaining({
          exposure: 90,
          transparent: true,
          environmentSrc: 'artifact-env://sky',
          environmentName: 'sky.hdr',
        }),
      },
      { id: 'clouds', kind: 'noise' },
    ]);
    expect(doc.graph).toEqual({
      edges: [
        { id: 'e1', fromId: 'bg', fromPort: 'out', toId: 'S', toPort: 'bg' },
        { id: 'e3', fromId: 'M', fromPort: 'out', toId: 'S', toPort: 'material' },
        { id: 'e5', fromId: 'clouds', fromPort: 'out', toId: 'S', toPort: 'env' },
        { id: 'e6', fromId: 'S', fromPort: 'out', toId: '__export__', toPort: 'in' },
      ],
      positions: { S: { x: 1, y: 1 } },
      nodes: { M: { kind: 'material', id: 'M' } },
      areas: [{ id: 'a', nodeIds: ['S'] }],
      primitiveViewStates: { S: { zoom: 2 } },
    });
  });

  it('keeps the source layer when something else uses it, and keeps a legacy environment without an env node', () => {
    const doc = migrateV18ToV19({
      layers: [prim],
      graph: {
        edges: [
          { id: 'e1', fromId: 'prim', fromPort: 'out', toId: 'S', toPort: 'model' },
          { id: 'e2', fromId: 'prim', fromPort: 'out', toId: '__export__', toPort: 'in' },
        ],
        positions: {},
        nodes: { S: { kind: 'scene3d', id: 'S', environmentSrc: 'artifact-env://old' } },
      },
    });

    expect((doc.layers as Array<{ id: string }>).map((layer) => layer.id)).toEqual(['prim', 'S']);
    expect((doc.layers as Array<{ scene?: { environmentSrc: string } }>)[1].scene?.environmentSrc).toBe(
      'artifact-env://old',
    );
  });

  it('passes a scene without a 3D source and leftover environment nodes through to their inputs', () => {
    const doc = migrateV18ToV19({
      layers: [{ id: 'bg', kind: 'fill' }],
      graph: {
        edges: [
          { id: 'e1', fromId: 'bg', fromPort: 'out', toId: 'S', toPort: 'bg' },
          { id: 'e2', fromId: 'S', fromPort: 'out', toId: 'E', toPort: 'in' },
          { id: 'e3', fromId: 'E', fromPort: 'out', toId: '__export__', toPort: 'in' },
        ],
        positions: {},
        nodes: { S: { kind: 'scene3d', id: 'S' }, E: { kind: 'environment', id: 'E' } },
      },
    });

    expect(doc.graph).toEqual({
      edges: [{ id: 'e3', fromId: 'bg', fromPort: 'out', toId: '__export__', toPort: 'in' }],
      positions: {},
      nodes: {},
    });
  });
});
