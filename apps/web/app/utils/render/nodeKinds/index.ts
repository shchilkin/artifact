import type { GraphNodeKind, GraphNodeOfKind } from '../../nodeKinds';
import { renderColorGraphNode } from './color';
import type { GraphNodeRenderContext } from './context';
import { renderMaskGraphNode } from './mask';
import { renderMaterialGraphNode } from './material';
import { renderMergeGraphNode } from './merge';
import { renderRepeatGraphNode } from './repeat';
import { renderShaderGraphNode } from './shader';
import { renderTransformGraphNode } from './transform';

export type { GraphNodeRenderContext, RenderDependency } from './context';
export { findLayer, resolveMaterialTextureCanvases, shaderMaterialConfig, throwIfRenderAborted } from './context';

type GraphNodeRenderer<K extends GraphNodeKind> = (
  node: GraphNodeOfKind<K>,
  context: GraphNodeRenderContext,
) => Promise<HTMLCanvasElement>;

/** How each graph-only node kind renders. A kind added to `GRAPH_NODE_MODELS` must add its renderer here. */
export const GRAPH_NODE_RENDERERS: { [K in GraphNodeKind]: GraphNodeRenderer<K> } = {
  merge: renderMergeGraphNode,
  color: renderColorGraphNode,
  repeat: renderRepeatGraphNode,
  material: renderMaterialGraphNode,
  mask: renderMaskGraphNode,
  transform: renderTransformGraphNode,
  shader: renderShaderGraphNode,
};

export function graphNodeRenderer<K extends GraphNodeKind>(kind: K): GraphNodeRenderer<K> {
  return GRAPH_NODE_RENDERERS[kind];
}
