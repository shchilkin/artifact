import { describe, expect, it } from 'vitest';
import type { CanvasGraph } from '../types/config';
import { makeEmojiLayer, makeFillLayer, makeGraphMergeNode, makeTextLayer } from '../types/config';
import {
  addColorNode,
  addGraphArea,
  addGraphEdge,
  addGrimeShadowNode,
  addMaskNode,
  addMergeNode,
  addNodesToGraphArea,
  addRepeatNode,
  addTransformNode,
  appendNodeToExportPath,
  assignNodesToGraphArea,
  collectDownstreamNodeIds,
  collectUpstreamNodeIds,
  connectedPortIds,
  EXPORT_NODE_ID,
  organizeGraph,
  removeColorNode,
  removeGraphArea,
  removeGraphEdge,
  removeGrimeShadowNode,
  removeLayerFromGraph,
  removeMaskNode,
  removeMergeNode,
  removeNodesFromGraphArea,
  removeRepeatNode,
  removeTransformNode,
  resolveOutputPath,
  resolveRenderOrder,
  resolveUpstreamRenderLayers,
  splitEdgeWithNode,
  updateColorNode,
  updateGraphArea,
  updateGraphPositions,
  updateGrimeShadowNode,
  updateMaskNode,
  updateRepeatNode,
  updateTransformNode,
  wouldCreateCycle,
} from './nodeGraph';

function emptyGraph(partial: Partial<CanvasGraph> = {}): CanvasGraph {
  return {
    edges: [],
    positions: {},
    mergeNodes: [],
    colorNodes: [],
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

  it('appends a new node into the export path', () => {
    const graph = emptyGraph({
      edges: [{ id: 'old-export', fromId: 'text-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
    });

    const next = appendNodeToExportPath(graph, 'effect-1', 'in', (fromId, toId, index) => {
      return `edge-${index}-${fromId}-${toId}`;
    });

    expect(next.edges).toEqual([
      { id: 'edge-0-text-1-effect-1', fromId: 'text-1', fromPort: 'out', toId: 'effect-1', toPort: 'in' },
      { id: 'edge-1-effect-1-__export__', fromId: 'effect-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ]);
    expect(graph.edges).toEqual([
      { id: 'old-export', fromId: 'text-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ]);
  });

  it('connects the first appended node directly to export', () => {
    const next = appendNodeToExportPath(emptyGraph(), 'fill-1', 'bg', (fromId, toId, index) => {
      return `edge-${index}-${fromId}-${toId}`;
    });

    expect(next.edges).toEqual([
      { id: 'edge-0-fill-1-__export__', fromId: 'fill-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ]);
  });

  it('adds and removes merge nodes with positions and connected edges', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'e-fill-merge', fromId: 'fill-1', fromPort: 'out', toId: 'merge-1', toPort: 'a' },
        { id: 'e-merge-export', fromId: 'merge-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: { 'fill-1': { x: 0, y: 0 } },
    });

    const withNode = addMergeNode(
      graph,
      { id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 100 },
      { x: 100, y: 200 },
    );
    const removed = removeMergeNode(withNode, 'merge-1');

    expect(withNode.mergeNodes.map((node) => node.id)).toEqual(['merge-1']);
    expect(withNode.positions['merge-1']).toEqual({ x: 100, y: 200 });
    expect(removed.mergeNodes).toEqual([]);
    expect(removed.positions['merge-1']).toBeUndefined();
    expect(removed.edges).toEqual([]);
    expect(graph.mergeNodes).toEqual([]);
  });

  it('adds, updates, and removes color nodes with positions and connected edges', () => {
    const graph = emptyGraph({
      edges: [{ id: 'e-color-export', fromId: 'color-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
    });
    const colorNode = {
      id: 'color-1',
      name: 'Color',
      contrast: 110,
      brightness: 5,
      saturation: 90,
      hue: 12,
    };

    const withNode = addColorNode(graph, colorNode, { x: 120, y: 80 });
    const updated = updateColorNode(withNode, 'color-1', { brightness: 120 });
    const removed = removeColorNode(updated, 'color-1');

    expect(withNode.colorNodes).toEqual([colorNode]);
    expect(withNode.positions['color-1']).toEqual({ x: 120, y: 80 });
    expect(updated.colorNodes[0]).toEqual({ ...colorNode, brightness: 120 });
    expect(withNode.colorNodes[0]).toEqual(colorNode);
    expect(removed.colorNodes).toEqual([]);
    expect(removed.positions['color-1']).toBeUndefined();
    expect(removed.edges).toEqual([]);
  });

  it('adds, updates, and removes repeat nodes with positions and connected edges', () => {
    const graph = emptyGraph({
      edges: [{ id: 'e-repeat-export', fromId: 'repeat-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['repeat-1'] }],
    });
    const repeatNode = {
      id: 'repeat-1',
      name: 'Repeater',
      pattern: 'grid' as const,
      count: 4,
      rows: 3,
      gap: 120,
      radius: 90,
      scale: 28,
      jitter: 0,
      rotation: 0,
      opacity: 100,
      blendMode: 'source-over',
    };

    const withNode = addRepeatNode(graph, repeatNode, { x: 160, y: 90 });
    const updated = updateRepeatNode(withNode, 'repeat-1', { count: 8 });
    const removed = removeRepeatNode(updated, 'repeat-1');

    expect(withNode.repeatNodes).toEqual([repeatNode]);
    expect(withNode.positions['repeat-1']).toEqual({ x: 160, y: 90 });
    expect(updated.repeatNodes?.[0]).toEqual({ ...repeatNode, count: 8 });
    expect(removed.repeatNodes).toEqual([]);
    expect(removed.positions['repeat-1']).toBeUndefined();
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
      id: 'mask-1',
      name: 'Mask',
      mode: 'alpha' as const,
      invert: false,
      threshold: 50,
      feather: 0,
      expand: 0,
      opacity: 100,
    };

    const withNode = addMaskNode(graph, maskNode, { x: 180, y: 120 });
    const updated = updateMaskNode(withNode, 'mask-1', { mode: 'threshold', invert: true });
    const removed = removeMaskNode(updated, 'mask-1');

    expect(withNode.maskNodes).toEqual([maskNode]);
    expect(withNode.positions['mask-1']).toEqual({ x: 180, y: 120 });
    expect(updated.maskNodes?.[0]).toEqual({ ...maskNode, mode: 'threshold', invert: true });
    expect(removed.maskNodes).toEqual([]);
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
    const transformNode = {
      id: 'transform-1',
      name: 'Transform',
      x: 0,
      y: 0,
      scaleX: 100,
      scaleY: 100,
      rotation: 0,
      opacity: 100,
    };

    const withNode = addTransformNode(graph, transformNode, { x: 200, y: 140 });
    const updated = updateTransformNode(withNode, 'transform-1', { rotation: 45, x: 12 });
    const removed = removeTransformNode(updated, 'transform-1');

    expect(withNode.transformNodes).toEqual([transformNode]);
    expect(withNode.positions['transform-1']).toEqual({ x: 200, y: 140 });
    expect(updated.transformNodes?.[0]).toEqual({ ...transformNode, rotation: 45, x: 12 });
    expect(removed.transformNodes).toEqual([]);
    expect(removed.positions['transform-1']).toBeUndefined();
    expect(removed.edges).toEqual([]);
    expect(removed.areas?.[0]?.nodeIds).toEqual([]);
  });

  it('adds, updates, and removes grime shadow nodes with positions and connected edges', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'e-source-shadow', fromId: 'source-a', fromPort: 'out', toId: 'shadow-1', toPort: 'in' },
        { id: 'e-shadow-export', fromId: 'shadow-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['shadow-1'] }],
    });
    const grimeShadowNode = {
      id: 'shadow-1',
      name: 'Grime Shadow',
      x: 8,
      y: 10,
      layers: 5,
      blur: 10,
      spread: 14,
      grime: 45,
      jitter: 10,
      opacity: 58,
      color: '#090606',
      seedOffset: 0,
      shadowOnly: false,
    };

    const withNode = addGrimeShadowNode(graph, grimeShadowNode, { x: 220, y: 160 });
    const updated = updateGrimeShadowNode(withNode, 'shadow-1', { grime: 80, shadowOnly: true });
    const removed = removeGrimeShadowNode(updated, 'shadow-1');

    expect(withNode.grimeShadowNodes).toEqual([grimeShadowNode]);
    expect(withNode.positions['shadow-1']).toEqual({ x: 220, y: 160 });
    expect(updated.grimeShadowNodes?.[0]).toEqual({ ...grimeShadowNode, grime: 80, shadowOnly: true });
    expect(removed.grimeShadowNodes).toEqual([]);
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
      mergeNodes: [{ id: 'merge-a', name: 'Merge', blendMode: 'source-over', opacity: 100 }],
      colorNodes: [{ id: 'color-a', name: 'Color', contrast: 100, brightness: 100, saturation: 100, hue: 0 }],
      areas: [{ id: 'area-main', name: 'Main', color: '#ff6b5a', nodeIds: ['layer-a', 'merge-a', 'color-a'] }],
    });

    const withoutLayer = removeLayerFromGraph(graph, 'layer-a');
    const withoutMerge = removeMergeNode(graph, 'merge-a');
    const withoutColor = removeColorNode(graph, 'color-a');

    expect(withoutLayer.areas?.[0]?.nodeIds).toEqual(['merge-a', 'color-a']);
    expect(withoutMerge.areas?.[0]?.nodeIds).toEqual(['layer-a', 'color-a']);
    expect(withoutColor.areas?.[0]?.nodeIds).toEqual(['layer-a', 'merge-a']);
  });
});

describe('resolveUpstreamRenderLayers', () => {
  it('returns only the layers reachable from a target merge node in render order', () => {
    const fill = makeFillLayer({ id: 'fill-1' });
    const text = makeTextLayer({ id: 'text-1' });
    const emoji = makeEmojiLayer({ id: 'emoji-1' });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-fill-merge', fromId: fill.id, fromPort: 'out', toId: 'merge-1', toPort: 'a' },
        { id: 'e-text-emoji', fromId: text.id, fromPort: 'out', toId: emoji.id, toPort: 'bg' },
        { id: 'e-emoji-merge', fromId: emoji.id, fromPort: 'out', toId: 'merge-1', toPort: 'b' },
      ],
      positions: {},
      mergeNodes: [{ id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 100 }],
    };

    expect(resolveUpstreamRenderLayers('merge-1', graph, [fill, text, emoji]).map((layer) => layer.id)).toEqual([
      fill.id,
      text.id,
      emoji.id,
    ]);
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

describe('collectDownstreamNodeIds', () => {
  it('returns a source and all downstream nodes, including graph-only nodes', () => {
    const graph = mergeColorExportGraph();

    expect([...collectDownstreamNodeIds('text-1', graph)].sort()).toEqual(
      [EXPORT_NODE_ID, 'color-1', 'merge-1', 'text-1'].sort(),
    );
  });

  it('does not collect unrelated branches', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'e-a-merge', fromId: 'a', fromPort: 'out', toId: 'merge', toPort: 'a' },
        { id: 'e-b-merge', fromId: 'b', fromPort: 'out', toId: 'merge', toPort: 'b' },
        { id: 'e-merge-export', fromId: 'merge', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
        { id: 'e-orphan-child', fromId: 'orphan', fromPort: 'out', toId: 'orphan-child', toPort: 'bg' },
      ],
    });

    const downstream = collectDownstreamNodeIds('a', graph);

    expect(downstream.has('a')).toBe(true);
    expect(downstream.has('merge')).toBe(true);
    expect(downstream.has(EXPORT_NODE_ID)).toBe(true);
    expect(downstream.has('b')).toBe(false);
    expect(downstream.has('orphan')).toBe(false);
    expect(downstream.has('orphan-child')).toBe(false);
  });

  it('is safe for legacy cyclic graphs', () => {
    const graph = emptyGraph({
      edges: [
        { id: 'e-a-b', fromId: 'a', fromPort: 'out', toId: 'b', toPort: 'bg' },
        { id: 'e-b-c', fromId: 'b', fromPort: 'out', toId: 'c', toPort: 'bg' },
        { id: 'e-c-a', fromId: 'c', fromPort: 'out', toId: 'a', toPort: 'bg' },
      ],
    });

    expect([...collectDownstreamNodeIds('a', graph)].sort()).toEqual(['a', 'b', 'c']);
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

describe('resolveRenderOrder', () => {
  it('ignores disconnected layers when walking the export path', () => {
    const fill = makeFillLayer({ id: 'fill-1' });
    const emoji = makeEmojiLayer({ id: 'emoji-1' });
    const orphan = makeTextLayer({ id: 'text-1' });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-fill-emoji', fromId: fill.id, fromPort: 'out', toId: emoji.id, toPort: 'bg' },
        { id: 'e-emoji-export', fromId: emoji.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
    };

    expect(
      resolveRenderOrder(graph, [fill, emoji, orphan])
        .slice(0, 2)
        .map((layer) => layer.id),
    ).toEqual([fill.id, emoji.id]);
  });
});

describe('splitEdgeWithNode', () => {
  it('replaces an edge with source->node and node->target edges', () => {
    const fill = makeFillLayer({ id: 'fill-1' });
    const text = makeTextLayer({ id: 'text-1' });
    const graph: CanvasGraph = {
      edges: [{ id: 'e-fill-text', fromId: fill.id, fromPort: 'out', toId: text.id, toPort: 'bg' }],
      positions: {},
      mergeNodes: [],
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
      mergeNodes: [merge],
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
