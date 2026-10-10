import type { AspectRatio, CanvasGraph, Layer } from '../../types/config';
import { estimateNodeHeight, listGraphNodeIds, organizeGraph } from '../../utils/nodeGraph';

export interface EntryLayoutRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const UNPOSITIONED_BLOCK_GAP = 96;

/**
 * Positions for graph nodes that have none, decided before Nodes first paints. Returns null when every node already
 * has a stored position. With no stored positions the whole graph gets the auto layout. Otherwise stored positions are
 * kept, and the unpositioned nodes are placed in their auto-layout arrangement below the stored nodes.
 */
export function layoutUnpositionedNodes(graph: CanvasGraph, layers: Layer[], aspect: AspectRatio): CanvasGraph | null {
  const nodeIds = listGraphNodeIds(graph, layers);
  const missing = nodeIds.filter((id) => !graph.positions[id]);
  if (missing.length === 0) return null;
  const organized = organizeGraph(graph, layers, aspect).positions;
  const stored = nodeIds.flatMap((id) => graph.positions[id] ?? []);
  if (stored.length === 0) return { ...graph, positions: organized };

  const placed = missing.flatMap((id) => (organized[id] ? [{ id, position: organized[id] }] : []));
  const offsetX = Math.min(...stored.map((p) => p.x)) - Math.min(...placed.map(({ position }) => position.x));
  const top = Math.max(...stored.map((p) => p.y)) + estimateNodeHeight(aspect) + UNPOSITIONED_BLOCK_GAP;
  const offsetY = top - Math.min(...placed.map(({ position }) => position.y));
  const positions = { ...graph.positions };
  for (const { id, position } of placed) positions[id] = { x: position.x + offsetX, y: position.y + offsetY };
  return { ...graph, positions };
}

/** True when any two node rectangles share area. Touching edges do not count. */
export function nodeRectsIntersect(rects: EntryLayoutRect[]): boolean {
  return rects.some((a, index) => rects.slice(index + 1).some((b) => rectsIntersect(a, b)));
}

function rectsIntersect(a: EntryLayoutRect, b: EntryLayoutRect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
