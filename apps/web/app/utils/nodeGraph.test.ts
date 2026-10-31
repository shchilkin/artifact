import { describe, expect, it } from 'vitest';
import type { CanvasGraph } from '../types/config';
import { makeEmojiLayer, makeFillLayer, makeTextLayer } from '../types/config';
import {
  addGraphArea,
  addGraphEdge,
  addGraphNode,
  addNodesToGraphArea,
  assignNodesToGraphArea,
  collectUpstreamNodeIds,
  connectedPortIds,
  EXPORT_NODE_ID,
  graphNodesById,
  graphNodesOfKind,
  organizeGraph,
  removeGraphArea,
  removeGraphEdge,
  removeGraphNode,
  removeLayerFromGraph,
  removeNodesFromGraphArea,
  resolveOutputPath,
  splitEdgeWithNode,
  updateGraphArea,
  updateGraphNode,
  updateGraphPositions,
  wouldCreateCycle,
} from './nodeGraph';
import {
  makeGraphColorNode,
  makeGraphMergeNode,
  makeGraphRepeatNode,
  makeGraphShaderNode,
  makeGraphTransformNode,
} from './nodeKinds';

function emptyGraph(partial: Partial<CanvasGraph> = {}): CanvasGraph {
  return {
    edges: [],
    positions: {},
    nodes: graphNodesById(),
    ...partial,
  };
}

function mergeColorExportGraph(extraEdges: CanvasGraph['edges'] = []) {
  return emptyGraph({
    edges: [
      { id: 'e-fill-merge', fromId: 'fill-1', fromPort: 'out', toId: 'merge-1', toPort: 'a' },
      { id: 'e-text-color', fromId: 'text-1', fromPort: 'out', toId: 'color-1', toPort: 'in' },
      { id: 'e-color-merge', fromId: 'color-1', fromPort: 'out', toId: 'merge-1', toPort: 'b' },
      { id: 'e-merge-export', fromId: 'merge-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ...extraEdges,
    ],
  });
}

describe('graph mutations', () => {
  it('adds an edge while replacing any existing edge for the same target port', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'old-bg', fromId: 'fill-1', fromPort: 'out', toId: 'text-1', toPort: 'bg' },
        { id: 'keep-in', fromId: 'fx-1', fromPort: 'out', toId: 'text-1', toPort: 'in' },
      ],
    });

    const next = addGraphEdge(graph, {
      id: 'new-bg',
      fromId: 'emoji-1',
      fromPort: 'out',
      toId: 'text-1',
      toPort: 'bg',
    });

    expect(next).not.toBe(graph);
    expect(next.edges).toEqual([
      { id: 'keep-in', fromId: 'fx-1', fromPort: 'out', toId: 'text-1', toPort: 'in' },
      { id: 'new-bg', fromId: 'emoji-1', fromPort: 'out', toId: 'text-1', toPort: 'bg' },
    ]);
    expect(graph.edges.map((edge) => edge.id)).toEqual(['old-bg', 'keep-in']);
  });

  it('removes an edge without mutating the original graph', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'remove-me', fromId: 'a', fromPort: 'out', toId: 'b', toPort: 'bg' },
        { id: 'keep-me', fromId: 'b', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
    });

    const next = removeGraphEdge(graph, 'remove-me');

    expect(next.edges).toEqual([{ id: 'keep-me', fromId: 'b', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }]);
    expect(graph.edges).toHaveLength(2);
  });

  it('adds and removes merge nodes with positions and connected edges', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'e-fill-merge', fromId: 'fill-1', fromPort: 'out', toId: 'merge-1', toPort: 'a' },
        { id: 'e-merge-export', fromId: 'merge-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: { 'fill-1': { x: 0, y: 0 } },
    });

    const withNode = addGraphNode(
      graph,
      makeGraphMergeNode({ id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 100 }),
      { x: 100, y: 200 },
    );
    const removed = removeGraphNode(withNode, 'merge-1');

    expect(graphNodesOfKind(withNode, 'merge').map((node) => node.id)).toEqual(['merge-1']);
    expect(withNode.positions['merge-1']).toEqual({ x: 100, y: 200 });
    expect(graphNodesOfKind(removed, 'merge')).toEqual([]);
    expect(removed.positions['merge-1']).toBeUndefined();
    expect(removed.edges).toEqual([]);
    expect(graphNodesOfKind(graph, 'merge')).toEqual([]);
  });

  it('adds, updates, and removes color nodes with positions and connected edges', () => {
    const graph = emptyGraph({
      edges: [{ id: 'e-color-export', fromId: 'color-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
    });
    const colorNode = {
      kind: 'color' as const,
      id: 'color-1',
      name: 'Color',
      contrast: 110,
      brightness: 5,
      saturation: 90,
      hue: 12,
    };

    const withNode = addGraphNode(graph, colorNode, { x: 120, y: 80 });
    const updated = updateGraphNode(withNode, 'color-1', { brightness: 120 });
    const removed = removeGraphNode(updated, 'color-1');

    expect(graphNodesOfKind(withNode, 'color')).toEqual([colorNode]);
    expect(withNode.positions['color-1']).toEqual({ x: 120, y: 80 });
    expect(graphNodesOfKind(updated, 'color')[0]).toEqual({ ...colorNode, brightness: 120 });
    expect(graphNodesOfKind(withNode, 'color')[0]).toEqual(colorNode);
    expect(graphNodesOfKind(removed, 'color')).toEqual([]);
    expect(removed.positions['color-1']).toBeUndefined();
    expect(removed.edges).toEqual([]);
  });

  it('adds, updates, and removes repeat nodes with positions and connected edges', () => {
    const graph = emptyGraph({
      edges: [{ id: 'e-repeat-export', fromId: 'repeat-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['repeat-1'] }],
    });
    const repeatNode = makeGraphRepeatNode({
      id: 'repeat-1',
      name: 'Repeater',
      pattern: 'grid',
      count: 4,
      rows: 3,
      gap: 120,
      radius: 90,
      scale: 28,
      jitter: 0,
      rotation: 0,
      opacity: 100,
      blendMode: 'source-over',
    });

    const withNode = addGraphNode(graph, repeatNode, { x: 160, y: 90 });
    const updated = updateGraphNode(withNode, 'repeat-1', { count: 8 });
    const removed = removeGraphNode(updated, 'repeat-1');

    expect(graphNodesOfKind(withNode, 'repeat')).toEqual([repeatNode]);
    expect(withNode.positions['repeat-1']).toEqual({ x: 160, y: 90 });
    expect(graphNodesOfKind(updated, 'repeat')?.[0]).toEqual({ ...repeatNode, count: 8 });
    expect(graphNodesOfKind(removed, 'repeat')).toEqual([]);
    expect(removed.positions['repeat-1']).toBeUndefined();
    expect(removed.edges).toEqual([]);
    expect(removed.areas?.[0]?.nodeIds).toEqual([]);
  });

  it('adds, updates, and removes material nodes with positions and connected edges', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'e-material-primitive', fromId: 'material-1', fromPort: 'out', toId: 'primitive-1', toPort: 'material' },
      ],
      areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['material-1'] }],
    });
    const materialNode = {
      kind: 'material' as const,
      id: 'material-1',
      name: 'Gold',
      materialPreset: 'goldFoil' as const,
      materialBaseColor: '#d4af37',
      materialAccentColor: '#fff4aa',
      materialMetalness: 0.95,
      materialRoughness: 0.24,
      materialClearcoat: 0.28,
      materialRelief: 0.36,
      materialGrain: 0.32,
      materialAnisotropy: 0.5,
    };

    const withNode = addGraphNode(graph, materialNode, { x: 160, y: 90 });
    const updated = updateGraphNode(withNode, 'material-1', { materialRoughness: 0.12 });
    const removed = removeGraphNode(updated, 'material-1');

    expect(graphNodesOfKind(withNode, 'material')).toEqual([materialNode]);
    expect(withNode.positions['material-1']).toEqual({ x: 160, y: 90 });
    expect(graphNodesOfKind(updated, 'material')?.[0]).toEqual({ ...materialNode, materialRoughness: 0.12 });
    expect(graphNodesOfKind(removed, 'material')).toEqual([]);
    expect(removed.positions['material-1']).toBeUndefined();
    expect(removed.edges).toEqual([]);
    expect(removed.areas?.[0]?.nodeIds).toEqual([]);
  });

  it('adds, updates, and removes shader nodes with positions and connected edges', () => {
    const graph = emptyGraph({
      edges: [{ id: 'e-shader-export', fromId: 'shader-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['shader-1'] }],
    });
    const shaderNode = makeGraphShaderNode({ id: 'shader-1', name: 'Shader', palette: ['#111111', '#222222'] });

    const withNode = addGraphNode(graph, shaderNode, { x: 180, y: 100 });
    const updated = updateGraphNode(withNode, 'shader-1', { palette: ['#ffffff', '#222222'], swirl: 64 });
    const removed = removeGraphNode(updated, 'shader-1');

    expect(graphNodesOfKind(withNode, 'shader')).toEqual([shaderNode]);
    expect(withNode.positions['shader-1']).toEqual({ x: 180, y: 100 });
    expect(graphNodesOfKind(updated, 'shader')?.[0]).toEqual({
      ...shaderNode,
      palette: ['#ffffff', '#222222'],
      swirl: 64,
    });
    expect(graphNodesOfKind(removed, 'shader')).toEqual([]);
    expect(removed.positions['shader-1']).toBeUndefined();
    expect(removed.edges).toEqual([]);
    expect(removed.areas?.[0]?.nodeIds).toEqual([]);
  });

  it('adds, updates, and removes mask nodes with both input edges', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'e-source-mask', fromId: 'source-a', fromPort: 'out', toId: 'mask-1', toPort: 'in' },
        { id: 'e-matte-mask', fromId: 'matte-a', fromPort: 'out', toId: 'mask-1', toPort: 'mask' },
        { id: 'e-mask-export', fromId: 'mask-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['mask-1'] }],
    });
    const maskNode = {
      kind: 'mask' as const,
      id: 'mask-1',
      name: 'Mask',
      mode: 'alpha' as const,
      invert: false,
      threshold: 50,
      feather: 0,
      expand: 0,
      opacity: 100,
    };

    const withNode = addGraphNode(graph, maskNode, { x: 180, y: 120 });
    const updated = updateGraphNode(withNode, 'mask-1', { mode: 'threshold', invert: true });
    const removed = removeGraphNode(updated, 'mask-1');

    expect(graphNodesOfKind(withNode, 'mask')).toEqual([maskNode]);
    expect(withNode.positions['mask-1']).toEqual({ x: 180, y: 120 });
    expect(graphNodesOfKind(updated, 'mask')?.[0]).toEqual({ ...maskNode, mode: 'threshold', invert: true });
    expect(graphNodesOfKind(removed, 'mask')).toEqual([]);
    expect(removed.positions['mask-1']).toBeUndefined();
    expect(removed.edges).toEqual([]);
    expect(removed.areas?.[0]?.nodeIds).toEqual([]);
  });

  it('adds, updates, and removes transform nodes with positions and connected edges', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'e-source-transform', fromId: 'source-a', fromPort: 'out', toId: 'transform-1', toPort: 'in' },
        { id: 'e-transform-export', fromId: 'transform-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['transform-1'] }],
    });
    const transformNode = makeGraphTransformNode({
      id: 'transform-1',
      name: 'Transform',
      x: 0,
      y: 0,
      scaleX: 100,
      scaleY: 100,
      rotation: 0,
      opacity: 100,
    });

    const withNode = addGraphNode(graph, transformNode, { x: 200, y: 140 });
    const updated = updateGraphNode(withNode, 'transform-1', { rotation: 45, x: 12 });
    const removed = removeGraphNode(updated, 'transform-1');

    expect(graphNodesOfKind(withNode, 'transform')).toEqual([transformNode]);
    expect(withNode.positions['transform-1']).toEqual({ x: 200, y: 140 });
    expect(graphNodesOfKind(updated, 'transform')?.[0]).toEqual({ ...transformNode, rotation: 45, x: 12 });
    expect(graphNodesOfKind(removed, 'transform')).toEqual([]);
    expect(removed.positions['transform-1']).toBeUndefined();
    expect(removed.edges).toEqual([]);
    expect(removed.areas?.[0]?.nodeIds).toEqual([]);
  });

  it('adds, updates, and removes transform nodes with positions and connected edges', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'e-source-shadow', fromId: 'source-a', fromPort: 'out', toId: 'shadow-1', toPort: 'in' },
        { id: 'e-shadow-export', fromId: 'shadow-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['shadow-1'] }],
    });
    const transformNode = makeGraphTransformNode({ id: 'shadow-1' });

    const withNode = addGraphNode(graph, transformNode, { x: 220, y: 160 });
    const updated = updateGraphNode(withNode, 'shadow-1', { rotation: 80, opacity: 40 });
    const removed = removeGraphNode(updated, 'shadow-1');

    expect(graphNodesOfKind(withNode, 'transform')).toEqual([transformNode]);
    expect(withNode.positions['shadow-1']).toEqual({ x: 220, y: 160 });
    expect(graphNodesOfKind(updated, 'transform')?.[0]).toEqual({ ...transformNode, rotation: 80, opacity: 40 });
    expect(graphNodesOfKind(removed, 'transform')).toEqual([]);
    expect(removed.positions['shadow-1']).toBeUndefined();
    expect(removed.edges).toEqual([]);
    expect(removed.areas?.[0]?.nodeIds).toEqual([]);
  });

  it('updates positions without replacing untouched positions', () => {
    const graph = emptyGraph({
      positions: {
        a: { x: 0, y: 0 },
        b: { x: 50, y: 60 },
      },
    });

    const next = updateGraphPositions(graph, [{ id: 'b', position: { x: 70, y: 90 } }]);

    expect(next.positions).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 70, y: 90 },
    });
    expect(graph.positions.b).toEqual({ x: 50, y: 60 });
  });

  it('adds, updates, assigns, and removes graph areas without affecting render edges', () => {
    const graph = emptyGraph({
      edges: [{ id: 'e-a-b', fromId: 'a', fromPort: 'out', toId: 'b', toPort: 'bg' }],
    });

    const withArea = addGraphArea(graph, {
      id: 'area-main',
      name: 'Main branch',
      color: '#ff6b5a',
      nodeIds: ['a', 'b', 'a', ''],
    });
    const renamed = updateGraphArea(withArea, 'area-main', { name: 'Hero branch', collapsed: true });
    const assigned = assignNodesToGraphArea(renamed, 'area-main', ['b', 'c', 'b']);
    const separated = removeNodesFromGraphArea(assigned, 'area-main', ['b']);
    const removed = removeGraphArea(assigned, 'area-main');

    expect(withArea.areas).toEqual([{ id: 'area-main', name: 'Main branch', color: '#ff6b5a', nodeIds: ['a', 'b'] }]);
    expect(renamed.areas?.[0]).toMatchObject({ name: 'Hero branch', collapsed: true, nodeIds: ['a', 'b'] });
    expect(assigned.areas?.[0]?.nodeIds).toEqual(['b', 'c']);
    expect(separated.areas).toEqual([
      { id: 'area-main', name: 'Hero branch', color: '#ff6b5a', nodeIds: ['c'], collapsed: true },
    ]);
    expect(assigned.edges).toEqual(graph.edges);
    expect(removed.areas).toEqual([]);
    expect(graph.areas).toBeUndefined();
  });

  it('keeps graph area membership exclusive when creating or extending areas', () => {
    const graph = emptyGraph({
      areas: [
        { id: 'area-1', name: 'Source', color: '#ff6b5a', nodeIds: ['a', 'b'] },
        { id: 'area-2', name: 'Type', color: '#8d5cff', nodeIds: ['c'] },
      ],
    });

    const withNewArea = addGraphArea(graph, {
      id: 'area-3',
      name: 'Combined',
      color: '#79e3c5',
      nodeIds: ['b', 'd'],
    });
    const extended = addNodesToGraphArea(withNewArea, 'area-2', ['a', 'e']);

    expect(withNewArea.areas).toEqual([
      { id: 'area-1', name: 'Source', color: '#ff6b5a', nodeIds: ['a'] },
      { id: 'area-2', name: 'Type', color: '#8d5cff', nodeIds: ['c'] },
      { id: 'area-3', name: 'Combined', color: '#79e3c5', nodeIds: ['b', 'd'] },
    ]);
    expect(extended.areas).toEqual([
      { id: 'area-2', name: 'Type', color: '#8d5cff', nodeIds: ['c', 'a', 'e'] },
      { id: 'area-3', name: 'Combined', color: '#79e3c5', nodeIds: ['b', 'd'] },
    ]);
    expect(graph.areas?.[0]?.nodeIds).toEqual(['a', 'b']);
  });

  it('removes deleted layer and graph-only node ids from areas', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'e-layer-merge', fromId: 'layer-a', fromPort: 'out', toId: 'merge-a', toPort: 'a' },
        { id: 'e-color-export', fromId: 'color-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: { 'layer-a': { x: 0, y: 0 }, 'merge-a': { x: 200, y: 0 }, 'color-a': { x: 400, y: 0 } },
      nodes: graphNodesById(
        makeGraphMergeNode({ id: 'merge-a', name: 'Merge', blendMode: 'source-over', opacity: 100 }),
        makeGraphColorNode({ id: 'color-a', name: 'Color', contrast: 100, brightness: 100, saturation: 100, hue: 0 }),
      ),
      areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['layer-a', 'merge-a', 'color-a'] }],
    });

    const withoutLayer = removeLayerFromGraph(graph, 'layer-a');
    const withoutMerge = removeGraphNode(graph, 'merge-a');
    const withoutColor = removeGraphNode(graph, 'color-a');

    expect(withoutLayer.areas?.[0]?.nodeIds).toEqual(['merge-a', 'color-a']);
    expect(withoutMerge.areas?.[0]?.nodeIds).toEqual(['layer-a', 'color-a']);
    expect(withoutColor.areas?.[0]?.nodeIds).toEqual(['layer-a', 'merge-a']);
  });
});

describe('collectUpstreamNodeIds', () => {
  it('returns a target and all upstream nodes, including graph-only nodes', () => {
    const graph = mergeColorExportGraph();

    expect([...collectUpstreamNodeIds(EXPORT_NODE_ID, graph)].sort()).toEqual(
      [EXPORT_NODE_ID, 'color-1', 'fill-1', 'merge-1', 'text-1'].sort(),
    );
  });
});

describe('resolveOutputPath', () => {
  it('returns only nodes and edges that feed the output target', () => {
    const graph = mergeColorExportGraph([
      { id: 'e-orphan-child', fromId: 'orphan', fromPort: 'out', toId: 'orphan-child', toPort: 'bg' },
    ]);

    const outputPath = resolveOutputPath(graph);

    expect([...outputPath.nodeIds].sort()).toEqual([EXPORT_NODE_ID, 'color-1', 'fill-1', 'merge-1', 'text-1'].sort());
    expect([...outputPath.edgeIds].sort()).toEqual(
      ['e-color-merge', 'e-fill-merge', 'e-merge-export', 'e-text-color'].sort(),
    );
  });
});

describe('splitEdgeWithNode', () => {
  it('replaces an edge with source->node and node->target edges', () => {
    const fill = makeFillLayer({ id: 'fill-1' });
    const text = makeTextLayer({ id: 'text-1' });
    const graph: CanvasGraph = {
      edges: [{ id: 'e-fill-text', fromId: fill.id, fromPort: 'out', toId: text.id, toPort: 'bg' }],
      positions: {},
      nodes: graphNodesById(),
    };

    const next = splitEdgeWithNode(graph, 'e-fill-text', 'fx-1', 'in');

    expect(next.edges).toEqual([
      { id: 'e-fill-text__before', fromId: fill.id, fromPort: 'out', toId: 'fx-1', toPort: 'in' },
      { id: 'e-fill-text__after', fromId: 'fx-1', fromPort: 'out', toId: text.id, toPort: 'bg' },
    ]);
  });
});

describe('wouldCreateCycle', () => {
  it('returns true when adding an edge would connect back to the source', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'e-a-b', fromId: 'a', fromPort: 'out', toId: 'b', toPort: 'bg' },
        { id: 'e-b-c', fromId: 'b', fromPort: 'out', toId: 'c', toPort: 'bg' },
      ],
    });

    expect(wouldCreateCycle(graph, 'c', 'a')).toBe(true);
  });

  it('returns false for an edge that does not create a path back to the source', () => {
    const graph = emptyGraph({
      edges: [{ id: 'e-a-b', fromId: 'a', fromPort: 'out', toId: 'b', toPort: 'bg' }],
    });

    expect(wouldCreateCycle(graph, 'a', 'c')).toBe(false);
  });
});

describe('organizeGraph', () => {
  it('lays out nodes by graph depth while keeping disconnected nodes present', () => {
    const fill = makeFillLayer({ id: 'fill-1' });
    const text = makeTextLayer({ id: 'text-1' });
    const orphan = makeEmojiLayer({ id: 'emoji-1' });
    const graph = emptyGraph({
      edges: [
        { id: 'e-fill-text', fromId: fill.id, fromPort: 'out', toId: text.id, toPort: 'bg' },
        { id: 'e-text-export', fromId: text.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {
        [fill.id]: { x: 500, y: 500 },
        [text.id]: { x: 400, y: 400 },
        [orphan.id]: { x: 300, y: 300 },
        [EXPORT_NODE_ID]: { x: 200, y: 200 },
      },
    });

    const next = organizeGraph(graph, [fill, text, orphan]);

    expect(next.positions[fill.id].x).toBeLessThan(next.positions[text.id].x);
    expect(next.positions[text.id].x).toBeLessThan(next.positions[EXPORT_NODE_ID].x);
    expect(next.positions[orphan.id]).toBeDefined();
    expect(graph.positions[fill.id]).toEqual({ x: 500, y: 500 });
  });

  it('leaves generous horizontal room for larger node cards', () => {
    const fill = makeFillLayer({ id: 'fill-1' });
    const text = makeTextLayer({ id: 'text-1' });
    const graph = emptyGraph({
      edges: [
        { id: 'e-fill-text', fromId: fill.id, fromPort: 'out', toId: text.id, toPort: 'bg' },
        { id: 'e-text-export', fromId: text.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
    });

    const next = organizeGraph(graph, [fill, text], '16:9');

    expect(next.positions[text.id].x - next.positions[fill.id].x).toBeGreaterThanOrEqual(480);
    expect(next.positions[EXPORT_NODE_ID].x - next.positions[text.id].x).toBeGreaterThanOrEqual(480);
  });

  it('keeps branch inputs near the merge where they are consumed', () => {
    const base = makeFillLayer({ id: 'base' });
    const first = makeTextLayer({ id: 'first' });
    const second = makeTextLayer({ id: 'second' });
    const branch = makeEmojiLayer({ id: 'branch' });
    const merge = makeGraphMergeNode({ id: 'merge-mid' });
    const graph = emptyGraph({
      nodes: graphNodesById(merge),
      edges: [
        { id: 'e-base-first', fromId: base.id, fromPort: 'out', toId: first.id, toPort: 'bg' },
        { id: 'e-first-second', fromId: first.id, fromPort: 'out', toId: second.id, toPort: 'bg' },
        { id: 'e-second-merge', fromId: second.id, fromPort: 'out', toId: merge.id, toPort: 'a' },
        { id: 'e-branch-merge', fromId: branch.id, fromPort: 'out', toId: merge.id, toPort: 'b' },
        { id: 'e-merge-export', fromId: merge.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
    });

    const next = organizeGraph(graph, [base, first, second, branch]);

    expect(next.positions[branch.id].x).toBe(next.positions[second.id].x);
    expect(next.positions[branch.id].x).toBeGreaterThan(next.positions[first.id].x);
    expect(next.positions[merge.id].x).toBeGreaterThan(next.positions[branch.id].x);
  });
});

describe('connectedPortIds', () => {
  it('returns connected source and target port ids', () => {
    const graph = emptyGraph({
      edges: [{ id: 'e-fill-text', fromId: 'fill-1', fromPort: 'out', toId: 'text-1', toPort: 'bg' }],
    });

    expect(connectedPortIds(graph)).toEqual({
      sources: new Set(['fill-1::out']),
      targets: new Set(['text-1::bg']),
    });
  });
});
