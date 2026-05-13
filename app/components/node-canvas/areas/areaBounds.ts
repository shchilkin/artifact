import type { Node as RFNode } from '@xyflow/react';

import type { CanvasGraph, GraphArea } from '../../../types/config';
import { NODE_H, NODE_W } from '../constants';

const AREA_PADDING_X = 32;
const AREA_PADDING_TOP = 52;
const AREA_PADDING_BOTTOM = 28;
const AREA_MIN_W = 260;
const AREA_MIN_H = 180;

export interface GraphAreaBounds {
  area: GraphArea;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeCount: number;
}

function nodeSize(node: RFNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? NODE_W,
    height: node.measured?.height ?? node.height ?? NODE_H,
  };
}

export function getGraphAreaBounds(graph: CanvasGraph, nodes: RFNode[]): GraphAreaBounds[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  return (graph.areas ?? [])
    .map((area) => {
      const rects = area.nodeIds
        .map((nodeId) => {
          const node = nodesById.get(nodeId);
          const position = node?.position ?? graph.positions[nodeId];
          if (!position) return null;
          const size = node ? nodeSize(node) : { width: NODE_W, height: NODE_H };
          return {
            x1: position.x,
            y1: position.y,
            x2: position.x + size.width,
            y2: position.y + size.height,
          };
        })
        .filter((rect): rect is NonNullable<typeof rect> => rect !== null);

      if (rects.length === 0) return null;

      const minX = Math.min(...rects.map((rect) => rect.x1));
      const minY = Math.min(...rects.map((rect) => rect.y1));
      const maxX = Math.max(...rects.map((rect) => rect.x2));
      const maxY = Math.max(...rects.map((rect) => rect.y2));
      const x = minX - AREA_PADDING_X;
      const y = minY - AREA_PADDING_TOP;
      const width = Math.max(AREA_MIN_W, maxX - minX + AREA_PADDING_X * 2);
      const height = Math.max(AREA_MIN_H, maxY - minY + AREA_PADDING_TOP + AREA_PADDING_BOTTOM);

      return {
        area,
        x,
        y,
        width,
        height,
        nodeCount: rects.length,
      };
    })
    .filter((bounds): bounds is GraphAreaBounds => bounds !== null);
}
