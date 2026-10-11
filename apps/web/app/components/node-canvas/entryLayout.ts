import type { AspectRatio, CanvasGraph, Layer } from '../../types/config';
import { estimateNodeHeight, listGraphNodeIds, organizeGraph } from '../../utils/nodeGraph';

export interface EntryLayoutRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const PLACED_BLOCK_GAP = 96;

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
  return placeBelow(graph, organized, missing, {
    left: Math.min(...stored.map((p) => p.x)),
    bottom: Math.max(...stored.map((p) => p.y)) + estimateNodeHeight(aspect),
  });
}

/**
 * Moves only measured node cards that intersect a card already kept in place. Cards are kept in render order, so a
 * card that overlaps nothing never moves. Moved cards keep their auto-layout arrangement and are placed below the
 * kept cards. Returns null when no cards intersect.
 */
export function resolveOverlappingNodes(
  graph: CanvasGraph,
  layers: Layer[],
  aspect: AspectRatio,
  rects: EntryLayoutRect[],
): CanvasGraph | null {
  const kept: EntryLayoutRect[] = [];
  const moved: string[] = [];
  for (const rect of rects) {
    if (kept.some((other) => rectsIntersect(rect, other))) moved.push(rect.id);
    else kept.push(rect);
  }
  if (moved.length === 0) return null;
  return placeBelow(graph, organizeGraph(graph, layers, aspect).positions, moved, {
    left: Math.min(...kept.map((rect) => rect.x)),
    bottom: Math.max(...kept.map((rect) => rect.y + rect.height)),
  });
}

function placeBelow(
  graph: CanvasGraph,
  organized: CanvasGraph['positions'],
  ids: string[],
  anchor: { left: number; bottom: number },
): CanvasGraph {
  const placed = ids.flatMap((id) => (organized[id] ? [{ id, position: organized[id] }] : []));
  const offsetX = anchor.left - Math.min(...placed.map(({ position }) => position.x));
  const offsetY = anchor.bottom + PLACED_BLOCK_GAP - Math.min(...placed.map(({ position }) => position.y));
  const positions = { ...graph.positions };
  for (const { id, position } of placed) positions[id] = { x: position.x + offsetX, y: position.y + offsetY };
  return { ...graph, positions };
}

/** Touching edges do not count as intersecting. */
function rectsIntersect(a: EntryLayoutRect, b: EntryLayoutRect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
