import type { Edge as RFEdge } from '@xyflow/react';

import type { CanvasGraph } from '../../types/config';
import { graphUtilityNodeKind } from '../../utils/nodeGraph';

export function toRFEdges(graph: CanvasGraph): RFEdge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.fromId,
    sourceHandle: edge.fromPort,
    target: edge.toId,
    targetHandle: edge.toPort,
    type: 'smoothstep',
    style: {
      stroke: getEdgeColor(edge.fromId, graph),
      strokeWidth: 2,
      opacity: 0.82,
    },
  }));
}

function getEdgeColor(fromId: string, graph: CanvasGraph): string {
  return EDGE_COLORS[graphUtilityNodeKind(graph, fromId) ?? 'layer'];
}

const EDGE_COLORS = {
  merge: 'oklch(74% 0.17 152)',
  color: 'oklch(72% 0.18 195)',
  repeat: 'oklch(76% 0.14 95)',
  mask: 'oklch(72% 0.18 35)',
  transform: 'oklch(70% 0.17 265)',
  grimeShadow: 'oklch(72% 0.18 35)',
  scene3d: 'oklch(72% 0.16 48)',
  environment: 'oklch(74% 0.16 190)',
  material: 'oklch(82% 0.14 78)',
  layer: 'oklch(64% 0.22 305)',
} as const;
