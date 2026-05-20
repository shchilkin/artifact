import type { NodeChange, Node as RFNode } from '@xyflow/react';

function hasSamePosition(a: RFNode['position'] | undefined, b: RFNode['position'] | undefined) {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y;
}

function hasSameDimensions(node: RFNode | undefined, change: Extract<NodeChange, { type: 'dimensions' }>) {
  if (!node || !change.dimensions) return false;
  const sameMeasured =
    node.measured?.width === change.dimensions.width && node.measured?.height === change.dimensions.height;
  return sameMeasured && node.resizing === change.resizing;
}

function hasSameMeasured(a: RFNode | undefined, b: RFNode | undefined) {
  return (
    a?.measured?.width === b?.measured?.width &&
    a?.measured?.height === b?.measured?.height &&
    a?.width === b?.width &&
    a?.height === b?.height
  );
}

function hasSameData(a: RFNode['data'], b: RFNode['data']) {
  const aKeys = Object.keys(a ?? {});
  const bKeys = Object.keys(b ?? {});
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.is(a?.[key], b?.[key]));
}

function hasSameNodeShape(a: RFNode, b: RFNode) {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.parentId === b.parentId &&
    a.selected === b.selected &&
    a.dragging === b.dragging &&
    a.resizing === b.resizing &&
    a.hidden === b.hidden &&
    hasSamePosition(a.position, b.position) &&
    hasSameMeasured(a, b) &&
    hasSameData(a.data, b.data)
  );
}

export function sameNodeList(a: RFNode[], b: RFNode[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((node, index) => hasSameNodeShape(node, b[index]));
}

/**
 * React Flow expects controlled node lists to accept measurement changes, but
 * repeated no-op dimensions can cause render loops when custom node contents
 * resize around overlays. Keep position/select changes live, accept real
 * measurement changes, and drop duplicate dimensions.
 */
export function stableNodeChanges(changes: NodeChange[], nodes: RFNode[]): NodeChange[] {
  if (changes.length === 0) return changes;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return changes.filter((change) => {
    if (change.type === 'dimensions') return !hasSameDimensions(nodeById.get(change.id), change);
    return true;
  });
}

export function retainNodeMeasurements(
  nextNodes: RFNode[],
  previousNodes: RFNode[],
  fallback: { width: number; height: number },
): RFNode[] {
  const previousById = new Map(previousNodes.map((node) => [node.id, node]));

  return nextNodes.map((node) => {
    if (node.measured?.width !== undefined && node.measured.height !== undefined) return node;
    const previous = previousById.get(node.id);
    return {
      ...node,
      measured: {
        width: node.measured?.width ?? previous?.measured?.width ?? fallback.width,
        height: node.measured?.height ?? previous?.measured?.height ?? fallback.height,
      },
    };
  });
}
