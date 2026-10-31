import type { Node as RFNode } from '@xyflow/react';
import type { GraphNodeKind, GraphNodeOfKind } from '../../../utils/nodeKinds';
import { colorNodeUi } from './color';
import { maskNodeUi } from './mask';
import { materialNodeUi } from './material';
import { mergeNodeUi } from './merge';
import { repeatNodeUi } from './repeat';
import { shaderNodeUi } from './shader';
import { transformNodeUi } from './transform';
import type { BuildRFNodeContext, RegisteredGraphNodeUi } from './types';

export type { BuildRFNodeContext, GraphNodeData } from './types';

/**
 * The editor UI of every graph-only node kind. A kind added to `GRAPH_NODE_MODELS` must add its UI here. The key
 * order is the order React Flow receives nodes of different kinds.
 */
export const GRAPH_NODE_UIS: { [K in GraphNodeKind]: RegisteredGraphNodeUi<K> } = {
  merge: mergeNodeUi,
  color: colorNodeUi,
  repeat: repeatNodeUi,
  material: materialNodeUi,
  mask: maskNodeUi,
  transform: transformNodeUi,
  shader: shaderNodeUi,
};

export const GRAPH_NODE_UI_KINDS = Object.keys(GRAPH_NODE_UIS) as GraphNodeKind[];

/** React Flow `nodeTypes` entries for every graph-only node kind. */
export const GRAPH_NODE_RF_TYPES = Object.fromEntries(
  GRAPH_NODE_UI_KINDS.map((kind) => [GRAPH_NODE_UIS[kind].rfType, GRAPH_NODE_UIS[kind].Component]),
);

/** React Flow node for a graph-only node. `common` holds the fields every node gets. */
export function buildGraphNodeRFNode<K extends GraphNodeKind>(
  node: GraphNodeOfKind<K>,
  context: BuildRFNodeContext,
  common: object,
  position: { x: number; y: number },
): RFNode {
  const ui: RegisteredGraphNodeUi<K> = GRAPH_NODE_UIS[node.kind as K];
  return {
    id: node.id,
    type: ui.rfType,
    position,
    selected: context.selectedNodeIds.has(node.id),
    data: { node, ...ui.rfData?.(node, context), ...common },
  };
}
