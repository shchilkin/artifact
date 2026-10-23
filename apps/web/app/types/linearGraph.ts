import type { CanvasGraph, GraphEdge, Layer } from './config';

/**
 * The linear graph for a layer stack: each layer feeds the next one, the top layer feeds Output.
 * Build it only where a document is created (factories, the schema 4 -> 5 migration) or to compare a graph with
 * its layer stack; never as a stand-in for a document's own graph.
 */
export const EXPORT_NODE_ID = '__export__';

export const BASE_NODE_W = 320;
const ARTWORK_NODE_W = 340;
const COL_GAP = 168;

export function estimateNodeWidth(id: string, layers: Layer[]): number {
  const layer = layers.find((item) => item.id === id);
  if (!layer) return BASE_NODE_W;
  return ['image', 'primitive', 'noise', 'array', 'lineField', 'model'].includes(layer.kind)
    ? ARTWORK_NODE_W
    : BASE_NODE_W;
}

/** Edges of the linear graph for this layer order. */
export function linearStackEdges(layers: readonly Pick<Layer, 'id' | 'kind'>[]): GraphEdge[] {
  return layers.map((layer, index) => {
    const next = layers[index + 1];
    return next
      ? {
          id: `e-${layer.id}-${next.id}`,
          fromId: layer.id,
          fromPort: 'out',
          toId: next.id,
          toPort: next.kind === 'effect' ? 'in' : 'bg',
        }
      : {
          id: `e-${layer.id}-${EXPORT_NODE_ID}`,
          fromId: layer.id,
          fromPort: 'out',
          toId: EXPORT_NODE_ID,
          toPort: 'in',
        };
  });
}

export function inferLinearGraph(layers: Layer[]): CanvasGraph {
  const positions: Record<string, { x: number; y: number }> = {};
  let x = 0;

  layers.forEach((layer) => {
    positions[layer.id] = { x, y: 80 };
    x += estimateNodeWidth(layer.id, layers) + COL_GAP;
  });
  positions[EXPORT_NODE_ID] = { x, y: 80 };
  const edges = linearStackEdges(layers);

  return {
    edges,
    positions,
    nodes: {},
    areas: [],
  };
}
