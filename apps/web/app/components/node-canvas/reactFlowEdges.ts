import type { Edge as RFEdge } from '@xyflow/react';

import type { CanvasGraph } from '../../types/config';
import { findGraphNode } from '../../utils/nodeGraph';
import { GRAPH_NODE_MODELS } from '../../utils/nodeKinds';

export function toRFEdges(graph: CanvasGraph): RFEdge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.fromId,
    sourceHandle: edge.fromPort,
    target: edge.toId,
    targetHandle: edge.toPort,
    type: 'smoothstep',
    interactionWidth: 28,
    style: {
      stroke: getEdgeColor(edge.fromId, graph),
      strokeWidth: 2.35,
      opacity: 0.9,
    },
  }));
}

function getEdgeColor(fromId: string, graph: CanvasGraph): string | undefined {
  // Layers share one edge color; graph-only nodes use their kind's color (shaders have none yet).
  const node = findGraphNode(graph, fromId);
  return node ? GRAPH_NODE_MODELS[node.kind].look.edgeColor : LAYER_EDGE_COLOR;
}

const LAYER_EDGE_COLOR = 'oklch(64% 0.22 305)';
