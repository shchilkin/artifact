import {
  type FitViewOptions,
  getViewportForBounds,
  type Node as RFNode,
  useNodesInitialized,
  useReactFlow,
  useStoreApi,
} from '@xyflow/react';
import { useLayoutEffect, useRef } from 'react';
import type { CanvasGraph } from '../../types/config';
import { FOCUS_NODE_FIT_OPTIONS } from './constants';
import type { EntryLayoutRect } from './entryLayout';

type EntryStage =
  | { kind: 'measuring' }
  | { kind: 'unpositioned' | 'placing'; positions: CanvasGraph['positions'] }
  | { kind: 'done' };

/**
 * Rendered inside React Flow; owns the one entry fit. It waits for the unpositioned-node placement to reach React
 * Flow, asks for overlapping measured cards to be placed, and waits for those positions. Then it centers the focus
 * node (Edit in Nodes), fits the graph (first entry, or when entry moved nodes), or keeps the restored viewport. The
 * viewport stays hidden until `onSettled`, so it never shows the unplaced graph or a second fit. Card heights are
 * reserved before thumbnails load, so one overlap check on measure is enough.
 */
export function NodeEntryViewport({
  fitOnEntry,
  fitViewOptions,
  focusNodeId,
  unpositionedPositions,
  nodes,
  onResolveOverlaps,
  onSettled,
}: {
  fitOnEntry: boolean;
  fitViewOptions: FitViewOptions;
  focusNodeId: string | null;
  /** Positions placed before the first paint, which the nodes must show before they are measured. */
  unpositionedPositions: CanvasGraph['positions'] | null;
  nodes: RFNode[];
  /** Places overlapping cards as a `silent` update and returns the new positions, or null when none overlap. */
  onResolveOverlaps: (rects: EntryLayoutRect[]) => CanvasGraph['positions'] | null;
  onSettled: () => void;
}) {
  const nodesInitialized = useNodesInitialized();
  const { getInternalNode, getNodesBounds, setViewport } = useReactFlow();
  const store = useStoreApi();
  const stageRef = useRef<EntryStage>(
    unpositionedPositions ? { kind: 'unpositioned', positions: unpositionedPositions } : { kind: 'measuring' },
  );

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (stage.kind === 'done' || !nodesInitialized) return;
    if (stage.kind !== 'measuring' && !nodes.every((node) => samePosition(node.position, stage.positions[node.id]))) {
      return;
    }
    if (stage.kind !== 'placing') {
      const positions = onResolveOverlaps(nodes.flatMap((node) => measuredRect(node, getInternalNode)));
      if (positions) {
        stageRef.current = { kind: 'placing', positions };
        return;
      }
    }
    const moved = stage.kind !== 'measuring';
    stageRef.current = { kind: 'done' };
    const fit = focusNodeId
      ? { ids: [focusNodeId], options: { ...fitViewOptions, ...FOCUS_NODE_FIT_OPTIONS } }
      : fitOnEntry || moved
        ? { ids: nodes.map((node) => node.id), options: fitViewOptions }
        : null;
    // `fitView` is not used: it waits for the next node change, which may never come on entry.
    const fitBounds = fit ? () => ({ bounds: getNodesBounds(fit.ids), options: fit.options }) : null;
    applyEntryViewport(store, setViewport, fitBounds, onSettled);
  }, [
    fitOnEntry,
    fitViewOptions,
    focusNodeId,
    getInternalNode,
    getNodesBounds,
    nodes,
    nodesInitialized,
    onResolveOverlaps,
    onSettled,
    setViewport,
    store,
  ]);

  return null;
}

const ENTRY_VIEWPORT_MAX_FRAMES = 60;

/**
 * Sets the entry viewport once React Flow's store has the moved positions, a measured pane, and its pan-zoom, which
 * can take a few frames after the nodes are measured, then settles the entry.
 */
function applyEntryViewport(
  store: ReturnType<typeof useStoreApi>,
  setViewport: ReturnType<typeof useReactFlow>['setViewport'],
  fitBounds:
    | (() => { bounds: ReturnType<ReturnType<typeof useReactFlow>['getNodesBounds']>; options: FitViewOptions })
    | null,
  onSettled: () => void,
  frame = 0,
) {
  requestAnimationFrame(() => {
    const { width, height, minZoom, maxZoom, panZoom } = store.getState();
    if (fitBounds && (!panZoom || !width || !height) && frame < ENTRY_VIEWPORT_MAX_FRAMES) {
      applyEntryViewport(store, setViewport, fitBounds, onSettled, frame + 1);
      return;
    }
    if (fitBounds) {
      const { bounds, options } = fitBounds();
      void setViewport(
        getViewportForBounds(
          bounds,
          width,
          height,
          options.minZoom ?? minZoom,
          options.maxZoom ?? maxZoom,
          options.padding ?? 0.1,
        ),
      );
    }
    onSettled();
  });
}

/** Graph nodes have no parents, so the controlled position is the card's flow position. */
function measuredRect(
  node: RFNode,
  getInternalNode: ReturnType<typeof useReactFlow>['getInternalNode'],
): EntryLayoutRect[] {
  const measured = getInternalNode(node.id)?.measured;
  if (!measured?.width || !measured.height) return [];
  return [{ id: node.id, ...node.position, width: measured.width, height: measured.height }];
}

/** A node the placement did not position counts as settled. */
function samePosition(a: { x: number; y: number }, b: { x: number; y: number } | undefined) {
  return b === undefined || (a.x === b.x && a.y === b.y);
}
