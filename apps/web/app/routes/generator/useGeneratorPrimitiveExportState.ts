import { type RefObject, useCallback, useMemo, useState } from 'react';
import type { PrimitiveViewportState } from '../../components/PrimitiveViewportState';
import type { CanvasDocument, CanvasGraph } from '../../types/config';
import { inferLinearGraph } from '../../utils/nodeGraph';

export function useGeneratorPrimitiveExportState({
  doc,
  docRef,
  onGraphChange,
}: {
  doc: CanvasDocument;
  docRef: RefObject<CanvasDocument>;
  onGraphChange: (graph: CanvasGraph) => void;
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
    (next: Record<string, PrimitiveViewportState>) => {
      setPrimitiveViewStates((current) => (primitiveViewStateMapsEqual(current, next) ? current : next));
      const currentDoc = docRef.current;
      const graph = currentDoc.graph ?? inferLinearGraph(currentDoc.layers);
      const currentPersisted = graph.primitiveViewStates ?? {};
      if (primitiveViewStateMapsEqual(currentPersisted, next)) return;
      onGraphChange({ ...graph, primitiveViewStates: prunePrimitiveViewStates(next, currentDoc.layers) });
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

function primitiveViewStateMapsEqual(
  a: Record<string, PrimitiveViewportState>,
  b: Record<string, PrimitiveViewportState>,
) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => {
    const left = a[key];
    const right = b[key];
    return (
      right !== undefined &&
      left.rotationX === right.rotationX &&
      left.rotationY === right.rotationY &&
      left.zoom === right.zoom &&
      left.panX === right.panX &&
      left.panY === right.panY &&
      (left.locked ?? false) === (right.locked ?? false)
    );
  });
}

function prunePrimitiveViewStates(
  viewStates: Record<string, PrimitiveViewportState>,
  layers: Array<{ id: string; kind: string }>,
) {
  const primitiveIds = new Set(layers.filter((layer) => layer.kind === 'primitive').map((layer) => layer.id));
  const entries = Object.entries(viewStates).filter(([id]) => primitiveIds.has(id));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
