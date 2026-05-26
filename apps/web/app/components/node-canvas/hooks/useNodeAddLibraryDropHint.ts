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

export function useNodeAddLibraryDropHint(
  canvasSurfaceRef: RefObject<HTMLDivElement | null>,
  { resolveEdgeId, onEdgeHoverChange }: UseNodeAddLibraryDropHintOptions = {},
) {
  useEffect(() => {
    const hasAddLibraryPayload = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes(ADD_LIBRARY_ACTION_MIME);

    const readAction = (event: DragEvent) => {
      const payload =
        event.dataTransfer?.getData(ADD_LIBRARY_ACTION_MIME) ||
        document.documentElement.dataset.artifactAddLibraryAction;
      return payload ? parseAddLibraryAction(payload) : null;
    };

    const setDropState = (active: boolean, ready: boolean, edgeReady: boolean) => {
      const surface = canvasSurfaceRef.current;
      if (!surface) return;
      surface.classList.toggle('node-canvas-add-drop-active', active);
      surface.classList.toggle('node-canvas-add-drop-ready', ready);
      surface.classList.toggle('node-canvas-add-drop-edge', edgeReady);
    };

    const updateFromPointer = (event: DragEvent) => {
      if (!hasAddLibraryPayload(event)) {
        setDropState(false, false, false);
        onEdgeHoverChange?.(null);
        return;
      }
      const rect = canvasSurfaceRef.current?.getBoundingClientRect();
      const insideCanvas = Boolean(
        rect &&
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      );
      const action = insideCanvas ? readAction(event) : null;
      const edgeId = action && resolveEdgeId ? resolveEdgeId(action, { x: event.clientX, y: event.clientY }) : null;
      onEdgeHoverChange?.(edgeId);
      setDropState(true, insideCanvas, Boolean(edgeId));
    };

    const clear = () => {
      setDropState(false, false, false);
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
