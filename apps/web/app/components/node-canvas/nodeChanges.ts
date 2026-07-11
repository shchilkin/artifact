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
  return [
    [a?.measured?.width, b?.measured?.width],
    [a?.measured?.height, b?.measured?.height],
    [a?.width, b?.width],
    [a?.height, b?.height],
  ].every(([left, right]) => left === right);
}

function isStringSet(value: unknown): value is Set<string> {
  return value instanceof Set && Array.from(value).every((item) => typeof item === 'string');
}

function hasSameStringSet(a: Set<string>, b: Set<string>) {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function isConnectedPortData(value: unknown): value is { sources: Set<string>; targets: Set<string> } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { sources?: unknown; targets?: unknown };
  return isStringSet(candidate.sources) && isStringSet(candidate.targets);
}

function hasSameDataValue(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true;
  if (isConnectedPortData(a) && isConnectedPortData(b)) {
    return hasSameStringSet(a.sources, b.sources) && hasSameStringSet(a.targets, b.targets);
  }
  return false;
}

function hasSameData(a: RFNode['data'], b: RFNode['data']) {
  const aKeys = Object.keys(a ?? {});
  const bKeys = Object.keys(b ?? {});
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => hasSameDataValue(a?.[key], b?.[key]));
}

function hasSameNodeShape(a: RFNode, b: RFNode) {
  const sameScalarFields = (['id', 'type', 'parentId', 'selected', 'dragging', 'resizing', 'hidden'] as const).every(
    (field) => a[field] === b[field],
  );
  return (
    sameScalarFields && hasSamePosition(a.position, b.position) && hasSameMeasured(a, b) && hasSameData(a.data, b.data)
  );
}

function hasCompleteMeasurement(node: RFNode) {
  return node.measured?.width !== undefined && node.measured.height !== undefined;
}

function firstDefined<T>(...values: (T | undefined)[]) {
  return values.find((value) => value !== undefined);
}

function retainNodeMeasurement(
  node: RFNode,
  previous: RFNode | undefined,
  fallback: { width: number; height: number },
) {
  if (hasCompleteMeasurement(node)) return node;
  return {
    ...node,
    width: firstDefined(node.width, previous?.width),
    height: firstDefined(node.height, previous?.height),
    measured: {
      width: firstDefined(node.measured?.width, previous?.measured?.width, fallback.width),
      height: firstDefined(node.measured?.height, previous?.measured?.height, fallback.height),
    },
  };
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
  return nextNodes.map((node) => retainNodeMeasurement(node, previousById.get(node.id), fallback));
}
