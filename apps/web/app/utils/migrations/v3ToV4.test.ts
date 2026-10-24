import { describe, expect, it } from 'vitest';
import { EXPORT_NODE_ID } from '../nodeGraph';
import { migrateV3ToV4 } from './v3ToV4';

type Graph = {
  edges: { fromId: string; toId: string; toPort: string }[];
  positions: Record<string, { x: number; y: number }>;
  areas?: { nodeIds: string[] }[];
  materialNodes?: Record<string, unknown>[];
  shaderNodes?: Record<string, unknown>[];
};

function layersOf(doc: Record<string, unknown>) {
  return doc.layers as Record<string, unknown>[];
}

function graphOf(doc: Record<string, unknown>) {
  return doc.graph as Graph;
}

describe('migrateV3ToV4', () => {
  it('resolves legacy source layers to their source kind', () => {
    const doc = migrateV3ToV4({ layers: [{ id: 'n', kind: 'source', sourceType: 'noise' }] });
    expect(layersOf(doc)[0]).toMatchObject({ id: 'n', kind: 'noise' });
  });

  it('rescales 0-100 material percentages on primitive layers and material nodes', () => {
    const doc = migrateV3ToV4({
      layers: [{ id: 'p', kind: 'primitive', materialMetalness: 80, materialRoughness: 0.25, materialGrain: '40' }],
      graph: { edges: [], materialNodes: [{ id: 'm', materialClearcoat: 50, materialRelief: 1 }] },
    });
    expect(layersOf(doc)[0]).toMatchObject({ materialMetalness: 0.8, materialRoughness: 0.25, materialGrain: 0.4 });
    expect(graphOf(doc).materialNodes?.[0]).toMatchObject({ materialClearcoat: 0.5, materialRelief: 1 });
  });

  it('maps removed shader kinds and drops static mesh gradient distortion', () => {
    const doc = migrateV3ToV4({
      graph: {
        edges: [],
        shaderNodes: [
          { id: 'a', shaderKind: 'staticMeshGradient', distortion: 40 },
          { id: 'b', shaderKind: 'halftoneCmyk', distortion: 40 },
          { id: 'c', shaderKind: 'meshGradient', distortion: 40 },
          { id: 'd', shaderKind: 'notAKind' },
        ],
      },
    });
    expect(graphOf(doc).shaderNodes?.map((node) => [node.shaderKind, node.distortion])).toEqual([
      ['meshGradient', 0],
      ['dotGrid', 40],
      ['meshGradient', 40],
      ['notAKind', undefined],
    ]);
  });

  it('splits combined effect layers and rewires the graph through the parts', () => {
    const doc = migrateV3ToV4({
      layers: [
        { id: 'fill', kind: 'fill', color: '#ff0000' },
        { id: 'fx', kind: 'effect', preset: 'warp', visible: true, locked: false, noiseWarp: 40, morphAmt: 30 },
      ],
      graph: {
        edges: [
          { id: 'e1', fromId: 'fill', fromPort: 'out', toId: 'fx', toPort: 'in' },
          { id: 'e2', fromId: 'fx', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
        ],
        positions: { fx: { x: 100, y: 20 } },
        areas: [{ id: 'area', nodeIds: ['fill', 'fx'] }],
      },
    });

    expect(layersOf(doc).map((layer) => [layer.id, layer.preset])).toEqual([
      ['fill', undefined],
      ['fx-morph-0', 'morph'],
      ['fx-noiseWarp-1', 'noiseWarp'],
    ]);
    const graph = graphOf(doc);
    expect(graph.edges.map(({ fromId, toId }) => `${fromId}->${toId}`).sort()).toEqual(
      ['fill->fx-morph-0', 'fx-morph-0->fx-noiseWarp-1', `fx-noiseWarp-1->${EXPORT_NODE_ID}`].sort(),
    );
    expect(graph.positions).toEqual({ 'fx-morph-0': { x: 100, y: 20 }, 'fx-noiseWarp-1': { x: 148, y: 68 } });
    expect(graph.areas?.[0]?.nodeIds).toEqual(['fill', 'fx-morph-0', 'fx-noiseWarp-1']);
  });

  it('keeps focused effect layers, including codec block variants, as they are', () => {
    const focused = { id: 'g', kind: 'effect', preset: 'grain', grain: 20 };
    const codec = { id: 'b', kind: 'effect', preset: 'macroblocks', badStream: 40 };
    const doc = migrateV3ToV4({ layers: [focused, codec] });
    expect(layersOf(doc)).toEqual([focused, codec]);
  });
});
