import { NODE_H, NODE_W } from './constants';

export interface AlignableNode {
  id: string;
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
}

export type NodeAlignmentGuide =
  | { orientation: 'vertical'; position: number; from: number; to: number }
  | { orientation: 'horizontal'; position: number; from: number; to: number };

export interface NodeAlignmentResult {
  position: { x: number; y: number };
  guides: NodeAlignmentGuide[];
}

interface NodeRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_THRESHOLD = 10;

function rectForNode(node: AlignableNode): NodeRect {
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? NODE_W,
    height: node.height ?? NODE_H,
  };
}

function anchorsX(rect: NodeRect) {
  return [
    { value: rect.x, offset: 0 },
    { value: rect.x + rect.width / 2, offset: rect.width / 2 },
    { value: rect.x + rect.width, offset: rect.width },
  ];
}

function anchorsY(rect: NodeRect) {
  return [
    { value: rect.y, offset: 0 },
    { value: rect.y + rect.height / 2, offset: rect.height / 2 },
    { value: rect.y + rect.height, offset: rect.height },
  ];
}

function guideSpan(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return { from: Math.min(aStart, bStart), to: Math.max(aEnd, bEnd) };
}

export function snapNodeToAlignment(
  movingNode: AlignableNode,
  peerNodes: AlignableNode[],
  options: { threshold?: number } = {},
): NodeAlignmentResult {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const moving = rectForNode(movingNode);
  const peers = peerNodes.filter((node) => node.id !== moving.id).map(rectForNode);
  const result = { ...movingNode.position };
  const guides: NodeAlignmentGuide[] = [];

  let bestX: { delta: number; distance: number; position: number; peer: NodeRect } | null = null;
  for (const peer of peers) {
    for (const source of anchorsX(moving)) {
      for (const target of anchorsX(peer)) {
        const delta = target.value - source.value;
        const distance = Math.abs(delta);
        if (distance > threshold) continue;
        if (!bestX || distance < bestX.distance) {
          bestX = { delta, distance, position: target.value, peer };
        }
      }
    }
  }

  if (bestX) {
    result.x += bestX.delta;
    const span = guideSpan(moving.y, moving.y + moving.height, bestX.peer.y, bestX.peer.y + bestX.peer.height);
    guides.push({ orientation: 'vertical', position: bestX.position, ...span });
  }

  let bestY: { delta: number; distance: number; position: number; peer: NodeRect } | null = null;
  for (const peer of peers) {
    for (const source of anchorsY(moving)) {
      for (const target of anchorsY(peer)) {
        const delta = target.value - source.value;
        const distance = Math.abs(delta);
        if (distance > threshold) continue;
        if (!bestY || distance < bestY.distance) {
          bestY = { delta, distance, position: target.value, peer };
        }
      }
    }
  }

  if (bestY) {
    result.y += bestY.delta;
    const span = guideSpan(moving.x, moving.x + moving.width, bestY.peer.x, bestY.peer.x + bestY.peer.width);
    guides.push({ orientation: 'horizontal', position: bestY.position, ...span });
  }

  return { position: result, guides };
}
