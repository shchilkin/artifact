import { type CSSProperties, useEffect, useMemo } from 'react';

import { AddLibraryPanel } from '../../add-library/AddLibraryPanel';
import {
  ADD_LIBRARY_ACTION_MIME,
  type AddLibraryAction,
  parseAddLibraryAction,
} from '../../add-library/addLibraryModel';
import { FloatingMenu } from '../../ui/floating-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../ui/sheet';
import { clampPopupPosition } from '../helpers';
import type { AddAction, PaneMenuProps } from '../types';

const MENU_W = 540;

export function NodeAddMenu({ x, y, onAdd, onDragAdd, onClose, menuRef }: PaneMenuProps) {
  const mobileSheet = typeof window !== 'undefined' && window.innerWidth <= 640;
  const position = useMemo(() => clampPopupPosition(x, y, MENU_W, 520), [x, y]);

  useEffect(() => {
    if (!onDragAdd) return;
    const hasAddLibraryPayload = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes(ADD_LIBRARY_ACTION_MIME);
    const handleDragOver = (event: DragEvent) => {
      if (!hasAddLibraryPayload(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const handleDrop = (event: DragEvent) => {
      const payload = event.dataTransfer?.getData(ADD_LIBRARY_ACTION_MIME);
      const action = payload ? parseAddLibraryAction(payload) : null;
      if (!action) return;
      event.preventDefault();
      const didAdd = onDragAdd(action as AddAction, { x: event.clientX, y: event.clientY });
      if (didAdd) onClose();
    };
    document.addEventListener('dragover', handleDragOver, true);
    document.addEventListener('drop', handleDrop, true);
    return () => {
      document.removeEventListener('dragover', handleDragOver, true);
      document.removeEventListener('drop', handleDrop, true);
    };
  }, [onClose, onDragAdd]);

  const handleAdd = (action: AddLibraryAction) => {
    onAdd(action as AddAction);
    onClose();
  };

  const content = (
    <AddLibraryPanel
      surface="nodes"
      searchLabel="Search nodes and effects"
      placeholder="Add node…"
      onAdd={handleAdd}
      onClose={onClose}
      draggable
    />
  );

  if (mobileSheet) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          ref={menuRef}
          side="bottom"
          className="add-library-surface add-library-node-menu nadd-surface add-library-mobile nadd-mobile"
          style={{ '--artifact-sheet-height': '82vh' } as CSSProperties}
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <SheetTitle className="sr-only">Add node</SheetTitle>
          <SheetDescription className="sr-only">
            Search nodes, sources, effects, and utilities to add to the graph.
          </SheetDescription>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <FloatingMenu
      ref={menuRef}
      x={position.left}
      y={position.top}
      className="add-library-surface add-library-node-menu nadd-surface"
      style={{ width: MENU_W }}
      onOpenChange={(open) => !open && onClose()}
      onWheelCapture={(event) => event.stopPropagation()}
    >
      {content}
    </FloatingMenu>
  );
}
