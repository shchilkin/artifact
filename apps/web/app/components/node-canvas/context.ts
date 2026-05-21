import { createContext, useContext } from 'react';

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
