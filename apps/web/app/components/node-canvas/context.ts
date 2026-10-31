import { createContext, useContext } from 'react';

import { canHideGraphNode, type GraphNode } from '../../utils/nodeKinds';
import type { NodeCanvasActionsContextValue, NodeCanvasPreviewContextValue } from './types';

export const NodeCanvasPreviewContext = createContext<NodeCanvasPreviewContextValue | null>(null);
export const NodeCanvasActionsContext = createContext<NodeCanvasActionsContextValue | null>(null);

export function useNodeCanvasPreview() {
  const value = useContext(NodeCanvasPreviewContext);
  if (!value) throw new Error('NodeCanvasPreviewContext missing');
  return value;
}

export function useNodeCanvasActions() {
  const value = useContext(NodeCanvasActionsContext);
  if (!value) throw new Error('NodeCanvasActionsContext missing');
  return value;
}

/** Hide props for a graph-only node card; empty for kinds Hide does not apply to. */
export function useGraphNodeHide(node: GraphNode) {
  const { updateGraphNode } = useNodeCanvasActions();
  if (!canHideGraphNode(node)) return {};
  return { muted: Boolean(node.hidden), onToggleMuted: () => updateGraphNode(node.id, { hidden: !node.hidden }) };
}
