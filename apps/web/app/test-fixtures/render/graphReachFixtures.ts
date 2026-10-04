import type { CanvasDocument, CanvasGraph, GraphEdge, Layer } from '../../types/config';
import {
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
import { renderGraphTarget } from '../../utils/renderer';

// Renderer-backed reachability fixtures shared by `collectGraphRenderReach` (graphRenderReach.test.ts)
// and the Layers tree (graphLayerTree.test.ts). Together they cover every branch of the per-kind input
// tables in `utils/render/graphInputs.ts`; each fixture is checked against the nodes the real renderer
// visits, so a renderer change that reads a new port fails here until the table follows.

export function edge(fromId: string, toId: string, toPort: GraphEdge['toPort']): GraphEdge {
  return { id: `${fromId}->${toId}:${toPort}`, fromId, fromPort: 'out', toId, toPort };
}

export function graph(edges: GraphEdge[], nodes: Partial<CanvasGraph> = {}): CanvasGraph {
  return { edges, positions: {}, mergeNodes: [], colorNodes: [], ...nodes };
}

export function documentFor(layers: Layer[], canvasGraph?: CanvasGraph): CanvasDocument {
  return {
    global: { bg: '#000000', seed: 1, aspect: '1:1' },
    layers,
    graph: canvasGraph,
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

export const fill = (id: string) => makeFillLayer({ id, name: id, color: '#336699' });

/** The node ids the renderer actually rendered, read back from its cache. */
export async function renderedNodeIds(doc: CanvasDocument, canvasGraph: CanvasGraph) {
  const entries = new Map<string, Promise<HTMLCanvasElement>>();
  const cache = { namespace: 'reach', entries, limit: 10_000 };
  await renderGraphTarget(doc, canvasGraph, EXPORT_NODE_ID, 16, 16, new Map(), { draft: true }, cache);
  return new Set([...entries.keys()].map((key) => key.slice('reach:'.length).split('@')[0]));
}

export interface GraphReachFixture {
  name: string;
  layers: Layer[];
  graph: CanvasGraph;
  /** Nodes the renderer reads without rendering them (Scene 3D model and material, a sourceless environment). */
  readOnly?: string[];
}

export const GRAPH_REACH_FIXTURES: GraphReachFixture[] = [
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
  {
    name: 'Scene 3D renders an environment that has a source',
    layers: [fill('sky'), fill('backdrop')],
    graph: graph(
      [
        edge('sky', 'env', 'in'),
        edge('env', 'scene', 'env'),
        edge('backdrop', 'scene', 'bg'),
        edge('scene', EXPORT_NODE_ID, 'in'),
      ],
      {
        scene3dNodes: [makeGraphScene3DNode({ id: 'scene', transparent: true })],
        environmentNodes: [makeGraphEnvironmentNode({ id: 'env' })],
      },
    ),
  },
  {
    name: 'primitive layer renders its material texture maps',
    layers: [fill('backdrop'), fill('rough'), makeSourceLayer('primitive', { id: 'ball', primitiveShape: 'sphere' })],
    graph: graph(
      [
        edge('backdrop', 'ball', 'bg'),
        edge('chrome', 'ball', 'material'),
        edge('rough', 'chrome', 'roughness'),
        edge('ball', EXPORT_NODE_ID, 'in'),
      ],
      { materialNodes: [makeGraphMaterialNode({ id: 'chrome' })] },
    ),
    readOnly: ['chrome'],
  },
  {
    name: 'standalone material renders only its albedo',
    layers: [fill('base'), fill('rough')],
    graph: graph(
      [edge('base', 'chrome', 'albedo'), edge('rough', 'chrome', 'roughness'), edge('chrome', EXPORT_NODE_ID, 'in')],
      { materialNodes: [makeGraphMaterialNode({ id: 'chrome' })] },
    ),
  },
  {
    name: 'shader on a material port renders as the albedo, ignoring its fill-role backdrop',
    layers: [fill('backdrop'), fill('ignored-backdrop')],
    graph: graph(
      [
        edge('backdrop', 'scene', 'bg'),
        edge('gradient', 'scene', 'material'),
        edge('ignored-backdrop', 'gradient', 'bg'),
        edge('scene', EXPORT_NODE_ID, 'in'),
      ],
      {
        scene3dNodes: [makeGraphScene3DNode({ id: 'scene', transparent: true })],
        shaderNodes: [makeGraphShaderNode({ id: 'gradient', role: 'fill' })],
      },
    ),
  },
  {
    name: 'a node that is not a 3D source on a model port is ignored',
    layers: [fill('backdrop'), fill('not-a-model')],
    graph: graph(
      [edge('backdrop', 'scene', 'bg'), edge('not-a-model', 'scene', 'model'), edge('scene', EXPORT_NODE_ID, 'in')],
      { scene3dNodes: [makeGraphScene3DNode({ id: 'scene', transparent: true })] },
    ),
  },
  {
    name: 'a node that is not a material on a material port is ignored, but its texture maps render',
    layers: [fill('backdrop'), fill('graded'), fill('rough')],
    graph: graph(
      [
        edge('backdrop', 'scene', 'bg'),
        edge('grade', 'scene', 'material'),
        edge('graded', 'grade', 'in'),
        edge('rough', 'grade', 'roughness'),
        edge('scene', EXPORT_NODE_ID, 'in'),
      ],
      {
        scene3dNodes: [makeGraphScene3DNode({ id: 'scene', transparent: true })],
        colorNodes: [makeGraphColorNode({ id: 'grade' })],
      },
    ),
  },
];
