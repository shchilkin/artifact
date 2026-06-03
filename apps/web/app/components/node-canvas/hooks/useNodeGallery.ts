import { useCallback, useMemo, useState } from 'react';
import type { CanvasDocument, CanvasGraph, Layer } from '../../../types/config';
import { defaultMediaViewState, type MediaViewState } from '../../NodeGalleryViewState';
import { defaultPrimitiveViewportState, type PrimitiveViewportState } from '../../PrimitiveViewportState';
import { cloneLayerSnapshot, isGalleryEligibleLayer } from '../helpers';
import type { NodeCanvasMachineEvent } from '../machine';

export interface UseNodeGalleryOptions {
  send: (event: NodeCanvasMachineEvent) => void;
  doc: CanvasDocument;
  graph: CanvasGraph;
  primitiveViewStates: Record<string, PrimitiveViewportState>;
  /** From machine context. */
  galleryNodeId: string | null;
  galleryReturnFocusRef: React.MutableRefObject<HTMLElement | null>;
}

export interface UseNodeGalleryResult {
  mediaViewStates: Record<string, MediaViewState>;
  openGallery: (id: string) => void;
  closeGallery: () => void;
  updateMediaView: (id: string, next: MediaViewState) => void;
  galleryDisplayLayer: Layer | null;
  galleryDisplayDoc: CanvasDocument | null;
  galleryPrimitiveViewState: PrimitiveViewportState | null;
  galleryMediaViewState: MediaViewState;
  galleryHint: string;
}

/**
 * Manages the gallery dialog: open/close, return focus, media view state,
 * and all derived values needed to render the gallery overlay.
 */
export function useNodeGallery({
  send,
  doc,
  graph,
  primitiveViewStates,
  galleryNodeId,
  galleryReturnFocusRef,
}: UseNodeGalleryOptions): UseNodeGalleryResult {
  const [mediaViewStates, setMediaViewStates] = useState<Record<string, MediaViewState>>({});

  const openGallery = useCallback(
    (id: string) => {
      const layer = doc.layers.find((item) => item.id === id);
      if (!layer || !isGalleryEligibleLayer(layer)) return;
      galleryReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      send({ type: 'GALLERY_OPENED', nodeId: id });
    },
    [doc.layers, galleryReturnFocusRef, send],
  );

  const closeGallery = useCallback(() => {
    send({ type: 'GALLERY_CLOSED' });
  }, [send]);

  const updateMediaView = useCallback((id: string, next: MediaViewState) => {
    setMediaViewStates((current) => ({ ...current, [id]: next }));
  }, []);

  const galleryDisplayLayer = galleryNodeId
    ? (doc.layers.find((layer) => layer.id === galleryNodeId && isGalleryEligibleLayer(layer)) ?? null)
    : null;

  const galleryDisplayDoc = useMemo(() => {
    if (!galleryDisplayLayer) return null;
    return {
      ...doc,
      graph,
      layers: doc.layers.map((layer) =>
        layer.id === galleryDisplayLayer.id ? cloneLayerSnapshot(galleryDisplayLayer) : layer,
      ),
    } satisfies CanvasDocument;
  }, [doc, galleryDisplayLayer, graph]);

  const galleryPrimitiveViewState =
    galleryDisplayLayer?.kind === 'primitive'
      ? (primitiveViewStates[galleryDisplayLayer.id] ?? defaultPrimitiveViewportState(galleryDisplayLayer))
      : null;

  const galleryMediaViewState = galleryDisplayLayer
    ? (mediaViewStates[galleryDisplayLayer.id] ?? defaultMediaViewState())
    : defaultMediaViewState();

  const galleryHint = galleryDisplayLayer
    ? galleryDisplayLayer.kind === 'primitive'
      ? 'Drag rotates, wheel or trackpad zooms, lock freezes camera. Export uses this camera.'
      : 'Drag to pan, scroll to zoom, Home resets.'
    : '';

  return {
    mediaViewStates,
    openGallery,
    closeGallery,
    updateMediaView,
    galleryDisplayLayer,
    galleryDisplayDoc,
    galleryPrimitiveViewState,
    galleryMediaViewState,
    galleryHint,
  };
}
