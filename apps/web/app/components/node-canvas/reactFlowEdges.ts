import type { Edge as RFEdge } from '@xyflow/react';

import type { CanvasGraph } from '../../types/config';

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
  if (graph.mergeNodes.some((node) => node.id === fromId)) return 'oklch(74% 0.17 152)';
  if ((graph.colorNodes ?? []).some((node) => node.id === fromId)) return 'oklch(72% 0.18 195)';
  if ((graph.repeatNodes ?? []).some((node) => node.id === fromId)) return 'oklch(76% 0.14 95)';
  if ((graph.maskNodes ?? []).some((node) => node.id === fromId)) return 'oklch(72% 0.18 35)';
  if ((graph.transformNodes ?? []).some((node) => node.id === fromId)) return 'oklch(70% 0.17 265)';
  if ((graph.grimeShadowNodes ?? []).some((node) => node.id === fromId)) return 'oklch(72% 0.18 35)';
  return 'oklch(64% 0.22 305)';
}
