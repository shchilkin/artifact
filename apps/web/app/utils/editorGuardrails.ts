import type { CanvasDocument, Layer } from '../types/config';

export interface LayerGuardrailState {
  locked: boolean;
  canDelete: boolean;
  canReorder: boolean;
  canEditControls: boolean;
  canToggleVisibility: boolean;
  reason: string | null;
}

export interface NodeGuardrailState {
  locked: boolean;
  layerBacked: boolean;
  canDelete: boolean;
  canEditControls: boolean;
  canMoveNode: boolean;
  reason: string | null;
}

export function getLayerGuardrailState(layer: Layer | null | undefined): LayerGuardrailState {
  const locked = !!layer?.locked;
  return {
    locked,
    canDelete: !locked,
    canReorder: !locked,
    canEditControls: true,
    canToggleVisibility: true,
    reason: locked ? 'Locked layer targets are protected from delete actions and layer-stack reorder.' : null,
  };
}

export function getNodeGuardrailState(doc: CanvasDocument, nodeId: string | null | undefined): NodeGuardrailState {
  const layer = nodeId ? doc.layers.find((item) => item.id === nodeId) : null;
  const layerState = getLayerGuardrailState(layer);
  if (layer) {
    return {
      locked: layerState.locked,
      layerBacked: true,
      canDelete: layerState.canDelete,
      canEditControls: true,
      canMoveNode: true,
      reason: layerState.reason,
    };
  }

  return {
    locked: false,
    layerBacked: false,
    canDelete: true,
    canEditControls: true,
    canMoveNode: true,
    reason: null,
  };
}

export function canDeleteLayer(layer: Layer | null | undefined): boolean {
  return getLayerGuardrailState(layer).canDelete;
}

export function canDeleteNodeFromDocument(doc: CanvasDocument, nodeId: string): boolean {
  return getNodeGuardrailState(doc, nodeId).canDelete;
}

export function canReorderDocumentLayers(currentLayers: Layer[], nextLayers: Layer[]): boolean {
  const nextIndexById = new Map(nextLayers.map((layer, index) => [layer.id, index]));
  return currentLayers.every((layer, index) => !layer.locked || nextIndexById.get(layer.id) === index);
}
