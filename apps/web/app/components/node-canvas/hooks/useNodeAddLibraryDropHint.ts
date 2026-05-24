import { type RefObject, useEffect } from 'react';

import { ADD_LIBRARY_ACTION_MIME } from '../../add-library/addLibraryModel';

export function useNodeAddLibraryDropHint(canvasSurfaceRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const hasAddLibraryPayload = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes(ADD_LIBRARY_ACTION_MIME);

    const setDropState = (active: boolean, ready: boolean) => {
      const surface = canvasSurfaceRef.current;
      if (!surface) return;
      surface.classList.toggle('node-canvas-add-drop-active', active);
      surface.classList.toggle('node-canvas-add-drop-ready', ready);
    };

    const updateFromPointer = (event: DragEvent) => {
      if (!hasAddLibraryPayload(event)) {
        setDropState(false, false);
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
      setDropState(true, insideCanvas);
    };

    const clear = () => setDropState(false, false);

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
  }, [canvasSurfaceRef]);
}
