import { type FitViewOptions, type Node as RFNode, useNodesInitialized, useReactFlow } from '@xyflow/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasDocument, CanvasGraph } from '../../types/config';
import type { DocumentUpdateMode } from '../../utils/documentHistory';
import { type EntryLayoutRect, layoutUnpositionedNodes, nodeRectsIntersect } from './entryLayout';

/** Fit options that center one node, shared by Edit in Nodes and the toolbar Output action. */
export const FOCUS_NODE_FIT_OPTIONS = { padding: 0.42, maxZoom: 0.95 } satisfies FitViewOptions;

/**
 * Gives unpositioned nodes the auto layout before Nodes first paints. The positions are written as one `silent`
 * document update: entry layout is normalization, like bootstrapping the graph, not a creative decision, so it adds
 * no undo entry (docs/state-model.md, "Undo rules").
 */
export function useUnpositionedNodeLayout(
  doc: CanvasDocument,
  graph: CanvasGraph,
  onGraphChange: (graph: CanvasGraph, mode?: DocumentUpdateMode) => void,
) {
  const [entryLayout] = useState(() => layoutUnpositionedNodes(graph, doc.layers, doc.global.aspect));
  const committedRef = useRef(false);
  useLayoutEffect(() => {
    if (!entryLayout || committedRef.current) return;
    committedRef.current = true;
    onGraphChange(entryLayout, 'silent');
  }, [entryLayout, onGraphChange]);
}

type EntryStage = { kind: 'measuring' } | { kind: 'relayout'; positions: CanvasGraph['positions'] } | { kind: 'done' };

/**
 * Rendered inside React Flow. Once the nodes are measured on entry, runs the auto layout when stored node cards
 * intersect, then centers the focus node (Edit in Nodes) or refits the relaid-out graph.
 */
export function NodeEntryViewport({
  focusNodeId,
  fitViewOptions,
  nodes,
  onRelayout,
}: {
  focusNodeId: string | null;
  fitViewOptions: FitViewOptions;
  nodes: RFNode[];
  /** Applies the auto layout as a `silent` update and returns the new positions. */
  onRelayout: () => CanvasGraph['positions'];
}) {
  const nodesInitialized = useNodesInitialized();
  const { fitView, getInternalNode } = useReactFlow();
  const stageRef = useRef<EntryStage>({ kind: 'measuring' });

  useEffect(() => {
    const stage = stageRef.current;
    if (stage.kind === 'done' || !nodesInitialized) return;
    const focusOptions = focusNodeId ? { ...FOCUS_NODE_FIT_OPTIONS, nodes: [{ id: focusNodeId }] } : null;
    if (stage.kind === 'measuring') {
      const rects = nodes.flatMap((node): EntryLayoutRect[] => {
        const internal = getInternalNode(node.id);
        if (!internal) return [];
        const { x, y } = internal.internals.positionAbsolute;
        return [{ id: node.id, x, y, width: internal.measured.width ?? 0, height: internal.measured.height ?? 0 }];
      });
      if (nodeRectsIntersect(rects)) {
        stageRef.current = { kind: 'relayout', positions: onRelayout() };
        return;
      }
      stageRef.current = { kind: 'done' };
      if (focusOptions) requestAnimationFrame(() => void fitView(focusOptions));
      return;
    }
    // Fit once React Flow has the relaid-out positions.
    if (!nodes.every((node) => samePosition(node.position, stage.positions[node.id]))) return;
    stageRef.current = { kind: 'done' };
    requestAnimationFrame(() => void fitView(focusOptions ?? fitViewOptions));
  }, [fitView, fitViewOptions, focusNodeId, getInternalNode, nodes, nodesInitialized, onRelayout]);

  return null;
}

function samePosition(a: { x: number; y: number }, b: { x: number; y: number } | undefined) {
  return b !== undefined && a.x === b.x && a.y === b.y;
}
