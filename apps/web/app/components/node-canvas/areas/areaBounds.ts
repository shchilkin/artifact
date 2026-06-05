import type { Node as RFNode } from '@xyflow/react';

import type { CanvasGraph, GraphArea } from '../../../types/config';
import { NODE_H, NODE_W } from '../constants';

export const AREA_PADDING_X = 32;
export const AREA_PADDING_TOP = 52;
export const AREA_PADDING_BOTTOM = 28;
const AREA_MIN_W = 260;
const AREA_MIN_H = 180;
const AREA_CLUSTER_GAP = 240;

export interface GraphAreaBounds {
  area: GraphArea;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeCount: number;
  segmentIndex: number;
  segmentCount: number;
}

function nodeSize(node: RFNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? NODE_W,
    height: node.measured?.height ?? node.height ?? NODE_H,
  };
}

interface NodeRect {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function rectsTouch(a: NodeRect, b: NodeRect): boolean {
  const gap = AREA_CLUSTER_GAP / 2;
  return a.x1 - gap <= b.x2 && a.x2 + gap >= b.x1 && a.y1 - gap <= b.y2 && a.y2 + gap >= b.y1;
}

function clusterRects(rects: NodeRect[]): NodeRect[][] {
  const clusters: NodeRect[][] = [];

  for (const rect of rects) {
    const touchingIndexes: number[] = [];
    clusters.forEach((cluster, index) => {
      if (cluster.some((item) => rectsTouch(item, rect))) touchingIndexes.push(index);
    });

    if (touchingIndexes.length === 0) {
      clusters.push([rect]);
      continue;
    }

    const [firstIndex, ...restIndexes] = touchingIndexes;
    clusters[firstIndex].push(rect);
    for (const index of restIndexes.reverse()) {
      clusters[firstIndex].push(...clusters[index]);
      clusters.splice(index, 1);
    }
  }

  return clusters;
}

function rectCenter(rect: NodeRect): { x: number; y: number } {
  return {
    x: rect.x1 + (rect.x2 - rect.x1) / 2,
    y: rect.y1 + (rect.y2 - rect.y1) / 2,
  };
}

function shouldSplitArea(areaNodeIds: Set<string>, areaRects: NodeRect[], allRects: NodeRect[]): boolean {
  const minX = Math.min(...areaRects.map((rect) => rect.x1));
  const minY = Math.min(...areaRects.map((rect) => rect.y1));
  const maxX = Math.max(...areaRects.map((rect) => rect.x2));
  const maxY = Math.max(...areaRects.map((rect) => rect.y2));

  return allRects.some((rect) => {
    if (areaNodeIds.has(rect.id)) return false;
    const center = rectCenter(rect);
    return center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY;
  });
}

export function getGraphAreaBounds(graph: CanvasGraph, nodes: RFNode[]): GraphAreaBounds[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const knownNodeIds = new Set([...Object.keys(graph.positions), ...nodes.map((node) => node.id)]);
  const assignedNodeIds = new Set<string>();

  const getRect = (nodeId: string): NodeRect | null => {
    const node = nodesById.get(nodeId);
    const position = node?.position ?? graph.positions[nodeId];
    if (!position) return null;
    const size = node ? nodeSize(node) : { width: NODE_W, height: NODE_H };
    return {
      id: nodeId,
      x1: position.x,
      y1: position.y,
      x2: position.x + size.width,
      y2: position.y + size.height,
    };
  };

  const allRects = [...knownNodeIds].map(getRect).filter((rect): rect is NodeRect => rect !== null);

  return (graph.areas ?? []).flatMap((area) => {
    const exclusiveNodeIds = area.nodeIds.filter((nodeId) => {
      if (assignedNodeIds.has(nodeId)) return false;
      assignedNodeIds.add(nodeId);
      return true;
    });
    const areaNodeIds = new Set(exclusiveNodeIds);
    const rects = exclusiveNodeIds.map(getRect).filter((rect): rect is NodeRect => rect !== null);

    if (rects.length === 0) return [];

    const clusters = shouldSplitArea(areaNodeIds, rects, allRects) ? clusterRects(rects) : [rects];

    return clusters.map((cluster, segmentIndex) => {
      const minX = Math.min(...cluster.map((rect) => rect.x1));
      const minY = Math.min(...cluster.map((rect) => rect.y1));
      const maxX = Math.max(...cluster.map((rect) => rect.x2));
      const maxY = Math.max(...cluster.map((rect) => rect.y2));
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
        segmentIndex,
        segmentCount: clusters.length,
      };
    });
  });
}
