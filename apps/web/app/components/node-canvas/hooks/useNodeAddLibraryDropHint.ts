import { type RefObject, useEffect } from 'react';

import {
  ADD_LIBRARY_ACTION_MIME,
  type AddLibraryAction,
  parseAddLibraryAction,
} from '../../add-library/addLibraryModel';

interface UseNodeAddLibraryDropHintOptions {
  resolveEdgeId?: (action: AddLibraryAction, point: { x: number; y: number }) => string | null;
  onEdgeHoverChange?: (edgeId: string | null) => void;
}

interface AddLibraryDropState {
  active: boolean;
  ready: boolean;
  edgeId: string | null;
  validAction: boolean;
}

export type AddLibraryDropVisualState = 'inactive' | 'idle' | 'canvas-ready' | 'edge-ready' | 'invalid';

export function useNodeAddLibraryDropHint(
  canvasSurfaceRef: RefObject<HTMLDivElement | null>,
  { resolveEdgeId, onEdgeHoverChange }: UseNodeAddLibraryDropHintOptions = {},
) {
  useEffect(() => {
    const setDropState = (state: AddLibraryDropState) => {
      const surface = canvasSurfaceRef.current;
      if (!surface) return;
      const visualState = resolveAddLibraryDropVisualState(state);
      surface.classList.toggle('node-canvas-add-drop-active', visualState !== 'inactive');
      surface.classList.toggle(
        'node-canvas-add-drop-ready',
        visualState === 'canvas-ready' || visualState === 'edge-ready',
      );
      surface.classList.toggle('node-canvas-add-drop-edge', visualState === 'edge-ready');
      surface.classList.toggle('node-canvas-add-drop-invalid', visualState === 'invalid');
      if (visualState === 'inactive') {
        delete surface.dataset.canvasChromeDropState;
      } else {
        surface.dataset.canvasChromeDropState = visualState;
      }
    };

    const updateFromPointer = (event: DragEvent) => {
      const state = resolveAddLibraryDropState(event, canvasSurfaceRef.current, resolveEdgeId);
      onEdgeHoverChange?.(state.edgeId);
      setDropState(state);
    };

    const clear = () => {
      setDropState(inactiveDropState());
      onEdgeHoverChange?.(null);
      delete document.documentElement.dataset.artifactAddLibraryAction;
    };

    document.addEventListener('dragover', updateFromPointer, true);
    document.addEventListener('dragenter', updateFromPointer, true);
    document.addEventListener('drop', clear, true);
    document.addEventListener('dragend', clear, true);
    return () => {
      document.removeEventListener('dragover', updateFromPointer, true);
      document.removeEventListener('dragenter', updateFromPointer, true);
      document.removeEventListener('drop', clear, true);
      document.removeEventListener('dragend', clear, true);
      clear();
    };
  }, [canvasSurfaceRef, onEdgeHoverChange, resolveEdgeId]);
}

function resolveAddLibraryDropState(
  event: DragEvent,
  surface: HTMLDivElement | null,
  resolveEdgeId: UseNodeAddLibraryDropHintOptions['resolveEdgeId'],
): AddLibraryDropState {
  if (!hasAddLibraryPayload(event)) return inactiveDropState();
  const ready = pointerInsideElement(event, surface);
  const action = ready ? readAddLibraryAction(event) : null;
  return {
    active: true,
    ready,
    edgeId: resolveDropEdgeId(action, resolveEdgeId, event),
    validAction: action !== null,
  };
}

function inactiveDropState(): AddLibraryDropState {
  return { active: false, ready: false, edgeId: null, validAction: false };
}

export function resolveAddLibraryDropVisualState(state: AddLibraryDropState): AddLibraryDropVisualState {
  if (!state.active) return 'inactive';
  if (!state.ready) return 'idle';
  if (!state.validAction) return 'invalid';
  return state.edgeId ? 'edge-ready' : 'canvas-ready';
}

function resolveDropEdgeId(
  action: AddLibraryAction | null,
  resolveEdgeId: UseNodeAddLibraryDropHintOptions['resolveEdgeId'],
  event: DragEvent,
) {
  if (!action) return null;
  if (!resolveEdgeId) return null;
  return resolveEdgeId(action, { x: event.clientX, y: event.clientY });
}

function hasAddLibraryPayload(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes(ADD_LIBRARY_ACTION_MIME);
}

function readAddLibraryAction(event: DragEvent) {
  const payload =
    event.dataTransfer?.getData(ADD_LIBRARY_ACTION_MIME) || document.documentElement.dataset.artifactAddLibraryAction;
  return payload ? parseAddLibraryAction(payload) : null;
}

function pointerInsideElement(event: DragEvent, surface: HTMLDivElement | null) {
  const rect = surface?.getBoundingClientRect();
  if (!rect) return false;
  return (
    coordinateInRange(event.clientX, rect.left, rect.right) && coordinateInRange(event.clientY, rect.top, rect.bottom)
  );
}

function coordinateInRange(value: number, min: number, max: number) {
  return value >= min && value <= max;
}
