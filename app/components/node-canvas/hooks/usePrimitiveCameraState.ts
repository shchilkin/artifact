import { useCallback, useEffect, useState } from 'react';

import type { Layer } from '../../../types/config';
import {
  defaultPrimitiveViewportState,
  type PrimitiveViewportState,
} from '../../PrimitiveViewportState';

export interface UsePrimitiveCameraStateOptions {
  /** Starting camera states, typically lifted from generator.tsx for export parity. */
  initialPrimitiveViewStates?: Record<string, PrimitiveViewportState>;
  /** Current document layers — used for lock/reset helpers that need the layer's defaults. */
  layers: Layer[];
  /** Called whenever the camera states map changes. Used to lift state to generator for export. */
  onPrimitiveViewStatesChange?: (viewStates: Record<string, PrimitiveViewportState>) => void;
}

export interface UsePrimitiveCameraStateResult {
  /** Full map of per-layer camera states. Pass to preview, thumbnails, gallery, and export. */
  primitiveViewStates: Record<string, PrimitiveViewportState>;
  /** Id of the layer whose primitive viewport is currently receiving pointer events, or null. */
  activePrimitiveViewportId: string | null;
  /**
   * True when there is an active primitive viewport that is unlocked. When true, the graph
   * container should suppress its own pointer gestures so they don't interfere.
   */
  primitiveViewportLockActive: boolean;
  /** Update the camera state for a single layer. Skips update when values are unchanged. */
  updatePrimitiveView: (id: string, viewState: PrimitiveViewportState) => void;
  /** Mark a primitive viewport as the active gesture target (or release it). */
  setPrimitiveViewportActive: (id: string, active: boolean) => void;
  /** Return the effective view state for a layer, falling back to its default. */
  getPrimitiveViewState: (layer: Extract<Layer, { kind: 'primitive' }>) => PrimitiveViewportState;
  /** Toggle the locked flag for a single layer's camera. */
  setPrimitiveCameraLocked: (id: string, locked: boolean) => void;
  /** Reset a layer's camera to its tiltX/tiltY default while preserving the locked flag. */
  resetPrimitiveCamera: (id: string) => void;
}

export function usePrimitiveCameraState({
  initialPrimitiveViewStates,
  layers,
  onPrimitiveViewStatesChange,
}: UsePrimitiveCameraStateOptions): UsePrimitiveCameraStateResult {
  const [primitiveViewStates, setPrimitiveViewStates] = useState<Record<string, PrimitiveViewportState>>(
    () => initialPrimitiveViewStates ?? {},
  );
  const [activePrimitiveViewportId, setActivePrimitiveViewportId] = useState<string | null>(null);

  // Lift state changes to the parent (generator.tsx) for export render options.
  useEffect(() => {
    onPrimitiveViewStatesChange?.(primitiveViewStates);
  }, [onPrimitiveViewStatesChange, primitiveViewStates]);

  const primitiveViewportLockActive = activePrimitiveViewportId !== null
    && layers.some((layer) => layer.id === activePrimitiveViewportId && layer.kind === 'primitive');

  const updatePrimitiveView = useCallback((id: string, viewState: PrimitiveViewportState) => {
    setPrimitiveViewStates((current) => {
      const previous = current[id];
      if (
        previous
        && previous.rotationX === viewState.rotationX
        && previous.rotationY === viewState.rotationY
        && previous.zoom === viewState.zoom
        && previous.panX === viewState.panX
        && previous.panY === viewState.panY
        && (previous.locked ?? false) === (viewState.locked ?? false)
      ) {
        return current;
      }
      return { ...current, [id]: viewState };
    });
  }, []);

  const setPrimitiveViewportActive = useCallback((id: string, active: boolean) => {
    setActivePrimitiveViewportId((current) => {
      if (active) return current === id ? current : id;
      return current === id ? null : current;
    });
  }, []);

  const getPrimitiveViewState = useCallback(
    (layer: Extract<Layer, { kind: 'primitive' }>): PrimitiveViewportState => {
      return primitiveViewStates[layer.id] ?? defaultPrimitiveViewportState(layer);
    },
    [primitiveViewStates],
  );

  const setPrimitiveCameraLocked = useCallback((id: string, locked: boolean) => {
    setPrimitiveViewStates((current) => {
      const layer = layers.find((l) => l.id === id && l.kind === 'primitive') as Extract<Layer, { kind: 'primitive' }> | undefined;
      const existing = current[id] ?? (layer ? defaultPrimitiveViewportState(layer) : null);
      if (!existing) return current;
      if ((existing.locked ?? false) === locked) return current;
      return { ...current, [id]: { ...existing, locked } };
    });
  }, [layers]);

  const resetPrimitiveCamera = useCallback((id: string) => {
    const layer = layers.find((l) => l.id === id && l.kind === 'primitive') as Extract<Layer, { kind: 'primitive' }> | undefined;
    if (!layer) return;
    setPrimitiveViewStates((current) => {
      const locked = current[id]?.locked ?? false;
      return { ...current, [id]: { ...defaultPrimitiveViewportState(layer), locked } };
    });
  }, [layers]);

  return {
    primitiveViewStates,
    activePrimitiveViewportId,
    primitiveViewportLockActive,
    updatePrimitiveView,
    setPrimitiveViewportActive,
    getPrimitiveViewState,
    setPrimitiveCameraLocked,
    resetPrimitiveCamera,
  };
}
