import { type RefObject, useCallback, useMemo, useState } from 'react';
import { type PrimitiveViewportState, primitiveViewStateMapsEqual } from '../../components/PrimitiveViewportState';
import type { CanvasDocument, CanvasGraph } from '../../types/config';
import type { GraphEditKind } from '../../utils/documentDispatch';
import type { DocumentUpdateMode } from '../../utils/documentHistory';
import { graphNodesOfKind } from '../../utils/nodeGraph';

export function useEditorPrimitiveExportState({
  doc,
  docRef,
  onGraphEdit,
}: {
  doc: CanvasDocument;
  docRef: RefObject<CanvasDocument>;
  onGraphEdit: (graph: CanvasGraph, edit: GraphEditKind) => void;
}) {
  const [primitiveViewStates, setPrimitiveViewStates] = useState<Record<string, PrimitiveViewportState>>({});

  const effectivePrimitiveViewStates = useMemo(
    () => ({
      ...(doc.graph.primitiveViewStates ?? {}),
      ...primitiveViewStates,
    }),
    [doc.graph.primitiveViewStates, primitiveViewStates],
  );
  const exportRenderOptions = useMemo(
    () => ({ primitiveViewStates: effectivePrimitiveViewStates }),
    [effectivePrimitiveViewStates],
  );

  const handlePrimitiveViewStatesChange = useCallback(
    (next: Record<string, PrimitiveViewportState>, mode: DocumentUpdateMode = 'debounce') => {
      setPrimitiveViewStates((current) => (primitiveViewStateMapsEqual(current, next) ? current : next));
      const currentDoc = docRef.current;
      const graph = currentDoc.graph;
      const currentPersisted = graph.primitiveViewStates ?? {};
      if (primitiveViewStateMapsEqual(currentPersisted, next)) return;
      onGraphEdit(
        { ...graph, primitiveViewStates: prunePrimitiveViewStates(next, currentDoc.layers, graph) },
        mode === 'snapshot' ? 'cameraCommit' : 'cameraDrag',
      );
    },
    [docRef, onGraphEdit],
  );

  const resetPrimitiveViewStates = useCallback(() => setPrimitiveViewStates({}), []);

  return {
    effectivePrimitiveViewStates,
    exportRenderOptions,
    handlePrimitiveViewStatesChange,
    resetPrimitiveViewStates,
  };
}

export function prunePrimitiveViewStates(
  viewStates: Record<string, PrimitiveViewportState>,
  layers: Array<{ id: string; kind: string }>,
  graph: Pick<CanvasGraph, 'nodes'>,
) {
  const viewportIds = new Set([
    ...layers.filter((layer) => layer.kind === 'primitive' || layer.kind === 'model').map((layer) => layer.id),
    ...graphNodesOfKind(graph, 'scene3d').map((node) => node.id),
  ]);
  const entries = Object.entries(viewStates).filter(([id]) => viewportIds.has(id));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
