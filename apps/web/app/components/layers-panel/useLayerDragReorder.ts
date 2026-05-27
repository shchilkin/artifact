import { useCallback, useRef, useState } from 'react';
import type { GraphArea, Layer } from '../../types/config';

export type LayerDropPosition = 'before' | 'after';
type LayerDropTarget = { id: string; position: LayerDropPosition };

export function reorderDisplayLayersForDrop(
  displayLayers: Layer[],
  sourceId: string,
  targetId: string,
  position: LayerDropPosition,
) {
  if (sourceId === targetId) return displayLayers;

  const next = [...displayLayers];
  const sourceIdx = next.findIndex((layer) => layer.id === sourceId);
  const targetIdx = next.findIndex((layer) => layer.id === targetId);
  if (sourceIdx === -1 || targetIdx === -1) return displayLayers;

  const [item] = next.splice(sourceIdx, 1);
  const adjustedTargetIdx = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx;
  const insertIdx = position === 'after' ? adjustedTargetIdx + 1 : adjustedTargetIdx;
  next.splice(Math.max(0, Math.min(insertIdx, next.length)), 0, item);
  return next;
}

export function useLayerDragReorder({
  displayLayers,
  areasByLayerId,
  onReorderLayers,
}: {
  displayLayers: Layer[];
  areasByLayerId: Map<string, GraphArea[]>;
  onReorderLayers: (newOrder: Layer[], areaSeparation?: { areaId: string; ids: string[] }) => void;
}) {
  const [dragOverTarget, setDragOverTarget] = useState<LayerDropTarget | null>(null);
  const dragLayerId = useRef<string | null>(null);
  const dropTargetRef = useRef<LayerDropTarget | null>(null);

  const handleDragStart = useCallback((id: string) => {
    dragLayerId.current = id;
  }, []);

  const handleDragOverLayer = useCallback((id: string, position: LayerDropPosition) => {
    const target = { id, position };
    dropTargetRef.current = target;
    setDragOverTarget(target);
  }, []);

  const handleCancelDrag = useCallback(() => {
    setDragOverTarget(null);
    dragLayerId.current = null;
    dropTargetRef.current = null;
  }, []);

  const handleDrop = useCallback(
    (targetId: string, position: LayerDropPosition) => {
      const sourceId = dragLayerId.current;
      const target = dropTargetRef.current ?? { id: targetId, position };
      if (!sourceId || sourceId === target.id) {
        handleCancelDrag();
        return;
      }

      const sourceLayer = displayLayers.find((layer) => layer.id === sourceId);
      const targetLayer = displayLayers.find((layer) => layer.id === target.id);
      if (!sourceLayer || !targetLayer) {
        handleCancelDrag();
        return;
      }

      const sourceArea = areasByLayerId.get(sourceId)?.[0];
      const targetArea = areasByLayerId.get(target.id)?.[0];
      const newDisplayLayers = reorderDisplayLayersForDrop(displayLayers, sourceId, target.id, target.position);
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
