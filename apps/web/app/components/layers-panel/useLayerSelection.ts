import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Layer } from '../../types/config';

export interface LayerSelectionModifiers {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

function currentLayerSelection(currentSelectedIds: Set<string>, selectedLayerId: string | null) {
  return currentSelectedIds.size > 0 ? currentSelectedIds : new Set(selectedLayerId ? [selectedLayerId] : []);
}

function rangeLayerSelection(orderedLayerIds: string[], anchorId: string, id: string) {
  const anchorIndex = orderedLayerIds.indexOf(anchorId);
  const targetIndex = orderedLayerIds.indexOf(id);
  if (anchorIndex < 0 || targetIndex < 0) return new Set([id]);
  const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
  return new Set(orderedLayerIds.slice(start, end + 1));
}

function toggledLayerSelection(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function activeLayerIdForSelection(selectedIds: Set<string>, id: string) {
  return selectedIds.has(id) ? id : ([...selectedIds].at(-1) ?? null);
}

export function computeNextLayerSelection({
  id,
  orderedLayerIds,
  currentSelectedIds,
  selectedLayerId,
  anchorId,
  modifiers,
}: {
  id: string;
  orderedLayerIds: string[];
  currentSelectedIds: Set<string>;
  selectedLayerId: string | null;
  anchorId: string | null;
  modifiers: LayerSelectionModifiers;
}): { selectedIds: Set<string>; anchorId: string | null; activeLayerId: string | null } {
  const current = currentLayerSelection(currentSelectedIds, selectedLayerId);
  const useRange = modifiers.shiftKey && anchorId;
  const useToggle = modifiers.metaKey || modifiers.ctrlKey;
  const next = useRange
    ? rangeLayerSelection(orderedLayerIds, anchorId, id)
    : useToggle
      ? toggledLayerSelection(current, id)
      : new Set([id]);
  const nextAnchorId = useRange ? anchorId : id;
  return { selectedIds: next, anchorId: nextAnchorId, activeLayerId: activeLayerIdForSelection(next, id) };
}

export function useLayerSelection({
  displayLayers,
  layers,
  selectedLayerId,
  onSelectLayer,
}: {
  displayLayers: Layer[];
  layers: Layer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
}) {
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(() => new Set());
  const selectionAnchorId = useRef<string | null>(null);

  const selectedActionLayerIds = useMemo(() => {
    const layerIds = new Set(layers.map((layer) => layer.id));
    const validSelected = [...selectedLayerIds].filter((id) => layerIds.has(id));
    if (validSelected.length > 0) return validSelected;
    return selectedLayerId && layerIds.has(selectedLayerId) ? [selectedLayerId] : [];
  }, [layers, selectedLayerId, selectedLayerIds]);

  const handleSelectLayer = useCallback(
    (id: string, event: ReactMouseEvent<HTMLDivElement>) => {
      const result = computeNextLayerSelection({
        id,
        orderedLayerIds: displayLayers.map((layer) => layer.id),
        currentSelectedIds: selectedLayerIds,
        selectedLayerId,
        anchorId: selectionAnchorId.current,
        modifiers: event,
      });

      selectionAnchorId.current = result.anchorId;
      setSelectedLayerIds(result.selectedIds);
      onSelectLayer(result.activeLayerId);
    },
    [displayLayers, onSelectLayer, selectedLayerId, selectedLayerIds],
  );

  return {
    selectedLayerIds,
    setSelectedLayerIds,
    selectedActionLayerIds,
    handleSelectLayer,
  };
}
