import { useCallback, useEffect, useMemo, useState } from 'react';
import { cloneLayerSnapshot, isGalleryEligibleLayer } from '../helpers';
import type { NodeCanvasMachineEvent } from '../machine';
import type { CanvasDocument, CanvasGraph, Layer } from '../../../types/config';
import { defaultPrimitiveViewportState, type PrimitiveViewportState } from '../../PrimitiveViewportState';
import { defaultMediaViewState, type MediaViewState } from '../../NodeGalleryViewState';

export interface UseNodeGalleryOptions {
  send: (event: NodeCanvasMachineEvent) => void;
  doc: CanvasDocument;
  graph: CanvasGraph;
  primitiveViewStates: Record<string, PrimitiveViewportState>;
  /** From machine context. */
  galleryNodeId: string | null;
  /** Refs owned by NodeCanvas and passed down so the focus trap can use them. */
  galleryModalRef: React.RefObject<HTMLDivElement | null>;
  galleryCloseButtonRef: React.RefObject<HTMLButtonElement | null>;
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
  galleryTitleId: string | undefined;
  galleryDescriptionId: string | undefined;
  galleryHint: string;
}

/**
 * Manages the gallery modal: open/close, focus trap, media view state,
 * and all derived values needed to render the gallery overlay.
 */
export function useNodeGallery({
  send,
  doc,
  graph,
  primitiveViewStates,
  galleryNodeId,
  galleryModalRef,
  galleryCloseButtonRef,
  galleryReturnFocusRef,
}: UseNodeGalleryOptions): UseNodeGalleryResult {
  const [mediaViewStates, setMediaViewStates] = useState<Record<string, MediaViewState>>({});

  const openGallery = useCallback((id: string) => {
    const layer = doc.layers.find((item) => item.id === id);
    if (!layer || !isGalleryEligibleLayer(layer)) return;
    send({ type: 'GALLERY_OPENED', nodeId: id });
  }, [doc.layers, send]);

  const closeGallery = useCallback(() => {
    send({ type: 'GALLERY_CLOSED' });
  }, [send]);

  const updateMediaView = useCallback((id: string, next: MediaViewState) => {
    setMediaViewStates((current) => ({ ...current, [id]: next }));
  }, []);

  // Focus trap and return-focus management for the gallery modal.
  useEffect(() => {
    if (!galleryNodeId) return;
    galleryReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => {
      galleryCloseButtonRef.current?.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        send({ type: 'GALLERY_CLOSED' });
        return;
      }
      if (event.key !== 'Tab') return;
      const modal = galleryModalRef.current;
      if (!modal) return;
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKey);
      galleryReturnFocusRef.current?.focus();
    };
  }, [galleryNodeId, send, galleryCloseButtonRef, galleryModalRef, galleryReturnFocusRef]);

  const galleryDisplayLayer = galleryNodeId
    ? doc.layers.find((layer) => layer.id === galleryNodeId && isGalleryEligibleLayer(layer)) ?? null
    : null;

  const galleryDisplayDoc = useMemo(() => {
    if (!galleryDisplayLayer) return null;
    return {
      ...doc,
      graph,
      layers: doc.layers.map((layer) => layer.id === galleryDisplayLayer.id ? cloneLayerSnapshot(galleryDisplayLayer) : layer),
    } satisfies CanvasDocument;
  }, [doc, galleryDisplayLayer, graph]);

  const galleryPrimitiveViewState = galleryDisplayLayer?.kind === 'primitive'
    ? primitiveViewStates[galleryDisplayLayer.id] ?? defaultPrimitiveViewportState(galleryDisplayLayer)
    : null;

  const galleryMediaViewState = galleryDisplayLayer
    ? mediaViewStates[galleryDisplayLayer.id] ?? defaultMediaViewState()
    : defaultMediaViewState();

  const galleryTitleId = galleryDisplayLayer ? `node-gallery-title-${galleryDisplayLayer.id}` : undefined;
  const galleryDescriptionId = galleryDisplayLayer ? `node-gallery-description-${galleryDisplayLayer.id}` : undefined;
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
    galleryTitleId,
    galleryDescriptionId,
    galleryHint,
  };
}
