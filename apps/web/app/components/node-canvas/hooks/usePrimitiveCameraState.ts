import { useCallback, useState } from 'react';

import type { Layer } from '../../../types/config';
import {
  defaultPrimitiveViewportState,
  type PrimitiveViewportState,
  primitiveViewStateMapsEqual,
  primitiveViewStatesEqual,
} from '../../PrimitiveViewportState';

export interface UsePrimitiveCameraStateOptions {
  /** Starting camera states, typically lifted from editor.tsx for export parity. */
  initialPrimitiveViewStates?: Record<string, PrimitiveViewportState>;
  /** Current document layers — used for lock/reset helpers that need the layer's defaults. */
  layers: Layer[];
  /** Called whenever the camera states map changes. Used to lift state to the editor shell for export. */
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
  /** Return the effective 3D view state for a primitive or model layer, falling back to its default. */
  getPrimitiveViewState: (layer: Extract<Layer, { kind: 'primitive' | 'model' }>) => PrimitiveViewportState;
  /** Toggle the locked flag for a single layer's camera. */
  setPrimitiveCameraLocked: (id: string, locked: boolean) => void;
  /** Reset a layer's camera to its tiltX/tiltY default while preserving the locked flag. */
  resetPrimitiveCamera: (id: string) => void;
}

function primitiveLayerById(layers: Layer[], id: string) {
  return layers.find((layer) => layer.id === id && layer.kind === 'primitive') as
    | Extract<Layer, { kind: 'primitive' }>
    | undefined;
}

function primitiveViewStateForLayer(current: Record<string, PrimitiveViewportState>, layers: Layer[], id: string) {
  const layer = primitiveLayerById(layers, id);
  return current[id] ?? (layer ? defaultPrimitiveViewportState(layer) : null);
}

function resolvePrimitiveViewStateUpdate(
  updater:
    | Record<string, PrimitiveViewportState>
    | ((current: Record<string, PrimitiveViewportState>) => Record<string, PrimitiveViewportState>),
  current: Record<string, PrimitiveViewportState>,
) {
  return typeof updater === 'function' ? updater(current) : updater;
}

function commitPrimitiveViewStates(
  next: Record<string, PrimitiveViewportState>,
  isControlled: boolean,
  setUncontrolled: (viewStates: Record<string, PrimitiveViewportState>) => void,
  onChange: ((viewStates: Record<string, PrimitiveViewportState>) => void) | undefined,
) {
  if (!isControlled) setUncontrolled(next);
  onChange?.(next);
}

export function usePrimitiveCameraState({
  initialPrimitiveViewStates,
  layers,
  onPrimitiveViewStatesChange,
}: UsePrimitiveCameraStateOptions): UsePrimitiveCameraStateResult {
  const [uncontrolledPrimitiveViewStates, setUncontrolledPrimitiveViewStates] = useState<
    Record<string, PrimitiveViewportState>
  >(() => initialPrimitiveViewStates ?? {});
  const [activePrimitiveViewportId, setActivePrimitiveViewportId] = useState<string | null>(null);
  const primitiveViewStates = initialPrimitiveViewStates ?? uncontrolledPrimitiveViewStates;

  const setPrimitiveViewStates = useCallback(
    (
      updater:
        | Record<string, PrimitiveViewportState>
        | ((current: Record<string, PrimitiveViewportState>) => Record<string, PrimitiveViewportState>),
    ) => {
      const current = initialPrimitiveViewStates ?? uncontrolledPrimitiveViewStates;
      const next = resolvePrimitiveViewStateUpdate(updater, current);
      if (primitiveViewStateMapsEqual(current, next)) return;
      commitPrimitiveViewStates(
        next,
        initialPrimitiveViewStates !== undefined,
        setUncontrolledPrimitiveViewStates,
        onPrimitiveViewStatesChange,
      );
    },
    [initialPrimitiveViewStates, onPrimitiveViewStatesChange, uncontrolledPrimitiveViewStates],
  );

  const primitiveViewportLockActive = activePrimitiveViewportId !== null;

  const updatePrimitiveView = useCallback(
    (id: string, viewState: PrimitiveViewportState) => {
      setPrimitiveViewStates((current) => {
        const previous = current[id];
        if (previous && primitiveViewStatesEqual(previous, viewState)) return current;
        return { ...current, [id]: viewState };
      });
    },
    [setPrimitiveViewStates],
  );

  const setPrimitiveViewportActive = useCallback((id: string, active: boolean) => {
    setActivePrimitiveViewportId((current) => {
      if (active) return current === id ? current : id;
      return current === id ? null : current;
    });
  }, []);

  const getPrimitiveViewState = useCallback(
    (layer: Extract<Layer, { kind: 'primitive' | 'model' }>): PrimitiveViewportState => {
      return primitiveViewStates[layer.id] ?? defaultPrimitiveViewportState(layer);
    },
    [primitiveViewStates],
  );

  const setPrimitiveCameraLocked = useCallback(
    (id: string, locked: boolean) => {
      setPrimitiveViewStates((current) => {
        const existing = primitiveViewStateForLayer(current, layers, id);
        if (!existing) return current;
        if ((existing.locked ?? false) === locked) return current;
        return { ...current, [id]: { ...existing, locked } };
      });
    },
    [layers, setPrimitiveViewStates],
  );

  const resetPrimitiveCamera = useCallback(
    (id: string) => {
      const layer = primitiveLayerById(layers, id);
      if (!layer) return;
      setPrimitiveViewStates((current) => {
        const locked = current[id]?.locked ?? false;
        return { ...current, [id]: { ...defaultPrimitiveViewportState(layer), locked } };
      });
    },
    [layers, setPrimitiveViewStates],
  );

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
