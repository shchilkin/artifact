import type { NodeChange, Node as RFNode } from '@xyflow/react';

function hasSameDimensions(node: RFNode | undefined, change: Extract<NodeChange, { type: 'dimensions' }>) {
  if (!node || !change.dimensions) return false;
  const sameMeasured =
    node.measured?.width === change.dimensions.width && node.measured?.height === change.dimensions.height;
  return sameMeasured && node.resizing === change.resizing;
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
