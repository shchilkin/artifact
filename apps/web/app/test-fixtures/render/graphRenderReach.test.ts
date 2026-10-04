import { describe, expect, it } from 'vitest';

import type { CanvasDocument, CanvasGraph, GraphEdge, Layer } from '../../types/config';
import {
  makeEffectPresetLayer,
  makeFillLayer,
  makeGraphColorNode,
  makeGraphEnvironmentNode,
  makeGraphMaskNode,
  makeGraphMaterialNode,
  makeGraphMergeNode,
  makeGraphRepeatNode,
  makeGraphScene3DNode,
  makeGraphShaderNode,
  makeGraphTransformNode,
  makeSourceLayer,
  makeTextLayer,
} from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { collectDocumentOutputNodeIds, collectGraphRenderReach, renderGraphTarget } from '../../utils/renderer';

function edge(fromId: string, toId: string, toPort: GraphEdge['toPort']): GraphEdge {
  return { id: `${fromId}->${toId}:${toPort}`, fromId, fromPort: 'out', toId, toPort };
}

function graph(edges: GraphEdge[], nodes: Partial<CanvasGraph> = {}): CanvasGraph {
  return { edges, positions: {}, mergeNodes: [], colorNodes: [], ...nodes };
}

function documentFor(layers: Layer[], canvasGraph?: CanvasGraph): CanvasDocument {
  return {
    global: { bg: '#000000', seed: 1, aspect: '1:1' },
    layers,
    graph: canvasGraph,
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

const fill = (id: string) => makeFillLayer({ id, color: '#336699' });

/** The node ids the renderer actually rendered, read back from its cache. */
async function renderedNodeIds(doc: CanvasDocument, canvasGraph: CanvasGraph) {
  const entries = new Map<string, Promise<HTMLCanvasElement>>();
  const cache = { namespace: 'reach', entries };
  await renderGraphTarget(doc, canvasGraph, EXPORT_NODE_ID, 16, 16, new Map(), { draft: true }, cache);
  return new Set([...entries.keys()].map((key) => key.slice('reach:'.length).split('@')[0]));
}

const FIXTURES: Array<{ name: string; layers: Layer[]; graph: CanvasGraph; readOnly?: string[] }> = [
  {
    name: 'linear stack with an unreachable layer',
    layers: [fill('base'), makeTextLayer({ id: 'title' }), fill('loose')],
    graph: graph([edge('base', 'title', 'bg'), edge('title', EXPORT_NODE_ID, 'in')]),
  },
  {
    name: 'merge with both inputs and a color node',
    layers: [fill('a'), fill('b'), fill('unused')],
    graph: graph(
      [
        edge('a', 'merge', 'a'),
        edge('b', 'tint', 'in'),
        edge('tint', 'merge', 'b'),
        edge('merge', EXPORT_NODE_ID, 'in'),
        edge('unused', 'orphan-color', 'in'),
      ],
      {
        mergeNodes: [makeGraphMergeNode({ id: 'merge' })],
        colorNodes: [makeGraphColorNode({ id: 'tint' }), makeGraphColorNode({ id: 'orphan-color' })],
      },
    ),
  },
  {
    name: 'mask, repeat and transform',
    layers: [fill('source'), fill('matte'), fill('item'), fill('backdrop')],
    graph: graph(
      [
        edge('source', 'mask', 'in'),
        edge('matte', 'mask', 'mask'),
        edge('item', 'repeat', 'in'),
        edge('mask', 'repeat', 'bg'),
        edge('repeat', 'move', 'in'),
        edge('move', EXPORT_NODE_ID, 'in'),
        edge('backdrop', 'move', 'bg'),
      ],
      {
        maskNodes: [makeGraphMaskNode({ id: 'mask' })],
        repeatNodes: [makeGraphRepeatNode({ id: 'repeat' })],
        transformNodes: [makeGraphTransformNode({ id: 'move' })],
      },
    ),
  },
  {
    name: 'duplicate edges on one port use the first edge',
    layers: [fill('first'), fill('second'), makeTextLayer({ id: 'title' })],
    graph: graph([edge('first', 'title', 'bg'), edge('second', 'title', 'bg'), edge('title', EXPORT_NODE_ID, 'in')]),
  },
  {
    name: 'edge on a port the layer renderer ignores',
    layers: [fill('ignored'), makeTextLayer({ id: 'title' })],
    graph: graph([edge('ignored', 'title', 'in'), edge('title', EXPORT_NODE_ID, 'in')]),
  },
  {
    name: 'missing export edge',
    layers: [fill('base'), makeTextLayer({ id: 'title' })],
    graph: graph([edge('base', 'title', 'bg')]),
  },
  {
    name: 'fill shader ignores its backdrop, effect shader reads it',
    layers: [fill('under-fill'), fill('under-effect')],
    graph: graph(
      [
        edge('under-fill', 'fill-shader', 'bg'),
        edge('fill-shader', 'merge', 'a'),
        edge('under-effect', 'effect-shader', 'bg'),
        edge('effect-shader', 'merge', 'b'),
        edge('merge', EXPORT_NODE_ID, 'in'),
      ],
      {
        mergeNodes: [makeGraphMergeNode({ id: 'merge' })],
        shaderNodes: [
          makeGraphShaderNode({ id: 'fill-shader', role: 'fill' }),
          makeGraphShaderNode({ id: 'effect-shader', role: 'effect' }),
        ],
      },
    ),
  },
  {
    name: 'Scene 3D reads its model, material and environment',
    layers: [makeSourceLayer('primitive', { id: 'model' }), fill('albedo'), fill('backdrop')],
    graph: graph(
      [
        edge('model', 'scene', 'model'),
        edge('material', 'scene', 'material'),
        edge('albedo', 'material', 'albedo'),
        edge('env', 'scene', 'env'),
        edge('backdrop', 'scene', 'bg'),
        edge('scene', EXPORT_NODE_ID, 'in'),
      ],
      {
        scene3dNodes: [makeGraphScene3DNode({ id: 'scene' })],
        materialNodes: [makeGraphMaterialNode({ id: 'material' })],
        environmentNodes: [makeGraphEnvironmentNode({ id: 'env' })],
      },
    ),
    readOnly: ['model', 'material', 'env'],
  },
];

describe('collectGraphRenderReach', () => {
  for (const fixture of FIXTURES) {
    it(`matches the nodes the renderer visits: ${fixture.name}`, async () => {
      const doc = documentFor(fixture.layers, fixture.graph);
      const reach = collectGraphRenderReach(doc, fixture.graph);
      const rendered = await renderedNodeIds(doc, fixture.graph);
      const readOnly = new Set(fixture.readOnly ?? []);

      expect([...reach].filter((id) => !readOnly.has(id)).sort()).toEqual([...rendered].sort());
      for (const id of readOnly) expect(reach.has(id)).toBe(true);
    });
  }

  it('keeps every link of a GPU-only effect chain the renderer collapses into one pass', () => {
    const layers = [
      fill('base'),
      makeEffectPresetLayer('grain', { id: 'grain' }),
      makeEffectPresetLayer('grain', { id: 'grain-2' }),
    ];
    const canvasGraph = graph([
      edge('base', 'grain', 'in'),
      edge('grain', 'grain-2', 'in'),
      edge('grain-2', EXPORT_NODE_ID, 'in'),
    ]);
    expect([...collectGraphRenderReach(documentFor(layers, canvasGraph), canvasGraph)].sort()).toEqual(
      [EXPORT_NODE_ID, 'base', 'grain', 'grain-2'].sort(),
    );
  });
});

describe('collectDocumentOutputNodeIds', () => {
  it('counts every layer of a document without a graph, like the stack renderer', () => {
    const doc = documentFor([fill('a'), makeTextLayer({ id: 'b' })]);
    expect(collectDocumentOutputNodeIds(doc)).toEqual(new Set([EXPORT_NODE_ID, 'a', 'b']));
  });

  it('follows the document graph when there is one', () => {
    const doc = documentFor([fill('a'), fill('loose')], graph([edge('a', EXPORT_NODE_ID, 'in')]));
    expect(collectDocumentOutputNodeIds(doc).has('loose')).toBe(false);
  });
});
