import { useCallback, useRef, useState } from 'react';
import type { GraphArea, Layer } from '../../types/config';

export type LayerDropPosition = 'before' | 'after';
type LayerDropTarget = { id: string; position: LayerDropPosition };
type LayerDropResult = { newOrder: Layer[]; areaSeparation?: { areaId: string; ids: string[] } };

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
    const current = dropTargetRef.current;
    if (current?.id === id && current.position === position) return;
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
      const result = resolveLayerDropResult(displayLayers, areasByLayerId, dragLayerId.current, {
        id: targetId,
        position,
      });
      if (result) onReorderLayers(result.newOrder, result.areaSeparation);
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

function resolveLayerDropResult(
  displayLayers: Layer[],
  areasByLayerId: Map<string, GraphArea[]>,
  sourceId: string | null,
  target: LayerDropTarget,
): LayerDropResult | null {
  if (!sourceId || sourceId === target.id) return null;
  if (!dropLayersExist(displayLayers, sourceId, target.id)) return null;

  const newDisplayLayers = reorderDisplayLayersForDrop(displayLayers, sourceId, target.id, target.position);
  return {
    newOrder: [...newDisplayLayers].reverse(),
    areaSeparation: layerDropAreaSeparation(areasByLayerId, sourceId, target.id),
  };
}

function dropLayersExist(displayLayers: Layer[], sourceId: string, targetId: string) {
  return displayLayers.some((layer) => layer.id === sourceId) && displayLayers.some((layer) => layer.id === targetId);
}

function layerDropAreaSeparation(
  areasByLayerId: Map<string, GraphArea[]>,
  sourceId: string,
  targetId: string,
): LayerDropResult['areaSeparation'] {
  const sourceArea = areasByLayerId.get(sourceId)?.[0];
  const targetArea = areasByLayerId.get(targetId)?.[0];
  return sourceArea && sourceArea.id !== targetArea?.id ? { areaId: sourceArea.id, ids: [sourceId] } : undefined;
}
