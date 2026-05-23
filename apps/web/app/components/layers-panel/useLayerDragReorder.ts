import { useCallback, useRef, useState } from 'react';
import type { GraphArea, Layer } from '../../types/config';

export function useLayerDragReorder({
  displayLayers,
  areasByLayerId,
  onReorderLayers,
}: {
  displayLayers: Layer[];
  areasByLayerId: Map<string, GraphArea[]>;
  onReorderLayers: (newOrder: Layer[], areaSeparation?: { areaId: string; ids: string[] }) => void;
}) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragLayerId = useRef<string | null>(null);

  const handleDragStart = useCallback((id: string) => {
    dragLayerId.current = id;
  }, []);

  const handleDragOverLayer = useCallback((id: string) => {
    setDragOverId(id);
  }, []);

  const handleCancelDrag = useCallback(() => {
    setDragOverId(null);
    dragLayerId.current = null;
  }, []);

  const handleDrop = useCallback(
    (targetId: string) => {
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
      newDisplayLayers.splice(targetIdx, 0, item);
      onReorderLayers(
        [...newDisplayLayers].reverse(),
        sourceArea && sourceArea.id !== targetArea?.id ? { areaId: sourceArea.id, ids: [sourceId] } : undefined,
      );
      handleCancelDrag();
    },
    [areasByLayerId, displayLayers, handleCancelDrag, onReorderLayers],
  );

  return {
    dragOverId,
    handleDragStart,
    handleDragOverLayer,
    handleDrop,
    handleCancelDrag,
  };
}
