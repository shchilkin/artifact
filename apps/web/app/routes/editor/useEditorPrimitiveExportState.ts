import { type RefObject, useCallback, useMemo, useState } from 'react';
import { type PrimitiveViewportState, primitiveViewStateMapsEqual } from '../../components/PrimitiveViewportState';
import type { CanvasDocument, CanvasGraph } from '../../types/config';
import type { DocumentUpdateMode } from '../../utils/documentHistory';
import { inferLinearGraph } from '../../utils/nodeGraph';

export function useEditorPrimitiveExportState({
  doc,
  docRef,
  onGraphChange,
}: {
  doc: CanvasDocument;
  docRef: RefObject<CanvasDocument>;
  onGraphChange: (graph: CanvasGraph, mode?: DocumentUpdateMode) => void;
}) {
  const [primitiveViewStates, setPrimitiveViewStates] = useState<Record<string, PrimitiveViewportState>>({});

  const effectivePrimitiveViewStates = useMemo(
    () => ({
      ...(doc.graph?.primitiveViewStates ?? {}),
      ...primitiveViewStates,
    }),
    [doc.graph?.primitiveViewStates, primitiveViewStates],
  );
  const exportRenderOptions = useMemo(
    () => ({ primitiveViewStates: effectivePrimitiveViewStates }),
    [effectivePrimitiveViewStates],
  );

  const handlePrimitiveViewStatesChange = useCallback(
    (next: Record<string, PrimitiveViewportState>, mode: DocumentUpdateMode = 'debounce') => {
      setPrimitiveViewStates((current) => (primitiveViewStateMapsEqual(current, next) ? current : next));
      const currentDoc = docRef.current;
      const graph = currentDoc.graph ?? inferLinearGraph(currentDoc.layers);
      const currentPersisted = graph.primitiveViewStates ?? {};
      if (primitiveViewStateMapsEqual(currentPersisted, next)) return;
      onGraphChange({ ...graph, primitiveViewStates: prunePrimitiveViewStates(next, currentDoc.layers, graph) }, mode);
    },
    [docRef, onGraphChange],
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
  graph: Pick<CanvasGraph, 'scene3dNodes'>,
) {
  const viewportIds = new Set([
    ...layers.filter((layer) => layer.kind === 'primitive' || layer.kind === 'model').map((layer) => layer.id),
    ...(graph.scene3dNodes ?? []).map((node) => node.id),
  ]);
  const entries = Object.entries(viewStates).filter(([id]) => viewportIds.has(id));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
