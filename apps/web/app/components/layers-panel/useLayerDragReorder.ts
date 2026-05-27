import { useCallback, useRef, useState } from 'react';
import type { GraphArea, Layer } from '../../types/config';

export type LayerDropPosition = 'before' | 'after';

export function useLayerDragReorder({
  displayLayers,
  areasByLayerId,
  onReorderLayers,
}: {
  displayLayers: Layer[];
  areasByLayerId: Map<string, GraphArea[]>;
  onReorderLayers: (newOrder: Layer[], areaSeparation?: { areaId: string; ids: string[] }) => void;
}) {
  const [dragOverTarget, setDragOverTarget] = useState<{ id: string; position: LayerDropPosition } | null>(null);
  const dragLayerId = useRef<string | null>(null);

  const handleDragStart = useCallback((id: string) => {
    dragLayerId.current = id;
  }, []);

  const handleDragOverLayer = useCallback((id: string, position: LayerDropPosition) => {
    setDragOverTarget({ id, position });
  }, []);

  const handleCancelDrag = useCallback(() => {
    setDragOverTarget(null);
    dragLayerId.current = null;
  }, []);

  const handleDrop = useCallback(
    (targetId: string, position: LayerDropPosition) => {
      const sourceId = dragLayerId.current;
      if (!sourceId || sourceId === targetId) {
        handleCancelDrag();
        return;
      }

      const newDisplayLayers = [...displayLayers];
      const sourceIdx = newDisplayLayers.findIndex((layer) => layer.id === sourceId);
      const targetIdx = newDisplayLayers.findIndex((layer) => layer.id === targetId);
      if (sourceIdx === -1 || targetIdx === -1) return;

      const sourceArea = areasByLayerId.get(sourceId)?.[0];
      const targetArea = areasByLayerId.get(targetId)?.[0];
      const [item] = newDisplayLayers.splice(sourceIdx, 1);
      const adjustedTargetIdx = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx;
      const insertIdx = position === 'after' ? adjustedTargetIdx + 1 : adjustedTargetIdx;
      newDisplayLayers.splice(insertIdx, 0, item);
      onReorderLayers(
        [...newDisplayLayers].reverse(),
        sourceArea && sourceArea.id !== targetArea?.id ? { areaId: sourceArea.id, ids: [sourceId] } : undefined,
      );
      handleCancelDrag();
    },
    [areasByLayerId, displayLayers, handleCancelDrag, onReorderLayers],
  );

  return {
    dragOverTarget,
    handleDragStart,
    handleDragOverLayer,
    handleDrop,
    handleCancelDrag,
  };
}
