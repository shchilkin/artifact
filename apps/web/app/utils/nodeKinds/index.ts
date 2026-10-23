import { colorNodeModel, type GraphColorNode } from './color';
import { environmentNodeModel, type GraphEnvironmentNode } from './environment';
import { type GraphGrimeShadowNode, grimeShadowNodeModel } from './grimeShadow';
import { type GraphMaskNode, maskNodeModel } from './mask';
import { type GraphMaterialNode, materialNodeModel } from './material';
import { type GraphMergeNode, mergeNodeModel } from './merge';
import { type GraphRepeatNode, repeatNodeModel } from './repeat';
import { type GraphScene3DNode, scene3dNodeModel } from './scene3d';
import { type GraphShaderNode, shaderNodeModel } from './shader';
import { type GraphTransformNode, transformNodeModel } from './transform';
import type { GraphNodeKindModel } from './types';

export type { GraphColorNode } from './color';
export { makeGraphColorNode } from './color';
export type { GraphEnvironmentNode } from './environment';
export { makeGraphEnvironmentNode } from './environment';
export type { GraphGrimeShadowNode } from './grimeShadow';
export { makeGraphGrimeShadowNode } from './grimeShadow';
export type { GraphMaskNode } from './mask';
export { makeGraphMaskNode } from './mask';
export type { GraphMaterialNode } from './material';
export { clampMaterialFractions, makeGraphMaterialNode } from './material';
export type { GraphMergeNode } from './merge';
export { makeGraphMergeNode } from './merge';
export type { GraphRepeatNode } from './repeat';
export { makeGraphRepeatNode } from './repeat';
export type { GraphScene3DNode } from './scene3d';
export { makeGraphScene3DNode } from './scene3d';
export type { GraphShaderNode } from './shader';
export { makeGraphShaderNode, shaderFollowsBackdrop } from './shader';
export type { GraphTransformNode } from './transform';
export { makeGraphTransformNode } from './transform';
export * from './types';

/** Any graph-only node (not a layer, not Output). Add a node kind here and in `GRAPH_NODE_MODELS`. */
export type GraphNode =
  | GraphMergeNode
  | GraphColorNode
  | GraphRepeatNode
  | GraphMaterialNode
  | GraphMaskNode
  | GraphTransformNode
  | GraphGrimeShadowNode
  | GraphShaderNode
  | GraphEnvironmentNode
  | GraphScene3DNode;

export type GraphNodeKind = GraphNode['kind'];

export type GraphNodeOfKind<K extends GraphNodeKind> = Extract<GraphNode, { kind: K }>;

/** The model of every graph-only node kind, in Add Library order. */
export const GRAPH_NODE_MODELS: { [K in GraphNodeKind]: GraphNodeKindModel<GraphNodeOfKind<K>> } = {
  merge: mergeNodeModel,
  color: colorNodeModel,
  mask: maskNodeModel,
  transform: transformNodeModel,
  grimeShadow: grimeShadowNodeModel,
  scene3d: scene3dNodeModel,
  environment: environmentNodeModel,
  repeat: repeatNodeModel,
  material: materialNodeModel,
  shader: shaderNodeModel,
};

/** A patch for any one node kind (only that kind's own fields). */
export type GraphNodePatch = { [K in GraphNodeKind]: Partial<Omit<GraphNodeOfKind<K>, 'id' | 'kind'>> }[GraphNodeKind];

export const GRAPH_NODE_KINDS = Object.keys(GRAPH_NODE_MODELS) as GraphNodeKind[];

export function isGraphNodeKind(value: unknown): value is GraphNodeKind {
  return typeof value === 'string' && value in GRAPH_NODE_MODELS;
}

/** The model for a node kind, typed for that kind. */
export function graphNodeModel<K extends GraphNodeKind>(kind: K): GraphNodeKindModel<GraphNodeOfKind<K>> {
  return GRAPH_NODE_MODELS[kind];
}

/** The model for a node, typed loosely; use for generic code that only passes the node back to its own model. */
export function modelOfNode(node: GraphNode): GraphNodeKindModel<GraphNode> {
  return GRAPH_NODE_MODELS[node.kind] as GraphNodeKindModel<GraphNode>;
}
