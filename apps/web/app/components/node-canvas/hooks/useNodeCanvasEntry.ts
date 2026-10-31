import type { Node as RFNode } from '@xyflow/react';
import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasDocument, CanvasGraph } from '../../../types/config';
import type { GraphEditKind } from '../../../utils/documentDispatch';
import { type EntryLayoutRect, layoutUnpositionedNodes, resolveOverlappingNodes } from '../entryLayout';
import type { NodeCanvasViewport } from '../types';

export interface UseNodeCanvasEntryOptions {
  doc: CanvasDocument;
  graph: CanvasGraph;
  graphRef: RefObject<CanvasGraph>;
  baseNodes: RFNode[];
  graphEmpty: boolean;
  initialViewport: NodeCanvasViewport | null | undefined;
  entryFocusNodeId: string | null | undefined;
  onGraphEdit: (graph: CanvasGraph, edit: GraphEditKind) => void;
}

/**
 * Entry state for one Nodes visit, decided once on mount: placement of unpositioned and overlapping nodes, and which
 * viewport to show. Placement writes positions as `silent` document updates: it repairs an unreadable first view,
 * like bootstrapping the graph, so it adds no undo entry (docs/state-model.md, "Undo rules").
 */
export function useNodeCanvasEntry({
  doc,
  graph,
  graphRef,
  baseNodes,
  graphEmpty,
  initialViewport,
  entryFocusNodeId,
  onGraphEdit,
}: UseNodeCanvasEntryOptions) {
  // Unpositioned nodes are placed before the first paint.
  const [unpositionedLayout] = useState(() => layoutUnpositionedNodes(graph, doc.layers, doc.global.aspect));
  const placedRef = useRef(false);
  useLayoutEffect(() => {
    if (!unpositionedLayout || placedRef.current) return;
    placedRef.current = true;
    onGraphEdit(unpositionedLayout, 'place');
  }, [onGraphEdit, unpositionedLayout]);

  // Decided once per entry. A graph with only the Output node is not fitted, so the fit does not stay queued and
  // jump the viewport when the first node is added. A focus node that is not in this graph falls back to the fit.
  const [entryViewport] = useState(() => initialViewport ?? undefined);
  const [focusNodeId] = useState(() =>
    entryFocusNodeId && baseNodes.some((node) => node.id === entryFocusNodeId) ? entryFocusNodeId : null,
  );
  const [fitOnEntry] = useState(() => !initialViewport && !graphEmpty);
  const [entryPending, setEntryPending] = useState(true);

  const resolveOverlaps = useCallback(
    (rects: EntryLayoutRect[]) => {
      const resolved = resolveOverlappingNodes(graphRef.current, doc.layers, doc.global.aspect, rects);
      if (!resolved) return null;
      onGraphEdit(resolved, 'place');
      return resolved.positions;
    },
    [doc.global.aspect, doc.layers, graphRef, onGraphEdit],
  );
  const settleEntry = useCallback(() => setEntryPending(false), []);

  return {
    entryViewport,
    entryPending,
    entryViewportProps: {
      fitOnEntry,
      focusNodeId,
      unpositionedPositions: unpositionedLayout?.positions ?? null,
      onResolveOverlaps: resolveOverlaps,
      onSettled: settleEntry,
    },
  };
}
