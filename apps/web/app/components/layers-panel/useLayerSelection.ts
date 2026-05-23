import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Layer } from '../../types/config';

export interface LayerSelectionModifiers {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
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
  const current = currentSelectedIds.size > 0 ? currentSelectedIds : new Set(selectedLayerId ? [selectedLayerId] : []);
  let next: Set<string>;
  let nextAnchorId = anchorId;

  if (modifiers.shiftKey && anchorId) {
    const anchorIndex = orderedLayerIds.indexOf(anchorId);
    const targetIndex = orderedLayerIds.indexOf(id);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      next = new Set(orderedLayerIds.slice(start, end + 1));
    } else {
      next = new Set([id]);
    }
  } else if (modifiers.metaKey || modifiers.ctrlKey) {
    next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    nextAnchorId = id;
  } else {
    next = new Set([id]);
    nextAnchorId = id;
  }

  return { selectedIds: next, anchorId: nextAnchorId, activeLayerId: next.has(id) ? id : ([...next].at(-1) ?? null) };
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
