import { useEffect, useMemo } from 'react';
import type { AddAction } from '../../../utils/addActions';
import { AddLibraryPanel } from '../../add-library/AddLibraryPanel';
import { preserveScopedAddLibraryEscape } from '../../add-library/addLibraryEscape';
import {
  ADD_LIBRARY_ACTION_MIME,
  type AddLibraryAction,
  parseAddLibraryAction,
} from '../../add-library/addLibraryModel';
import { useAddLibraryMobileSheet } from '../../add-library/useAddLibraryMobileSheet';
import { EditorOverlayFrame } from '../../editor-workflow/EditorOverlayFrame';
import { clampPopupPosition } from '../helpers';
import type { PaneMenuProps } from '../types';

const MENU_W = 540;

export function NodeAddMenu({ x, y, onAdd, onDragAdd, onClose, menuRef }: PaneMenuProps) {
  const mobileSheet = useAddLibraryMobileSheet();
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
      onDragAdd(action as AddAction, { x: event.clientX, y: event.clientY });
      onClose();
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

  return (
    <EditorOverlayFrame
      variant="floating"
      open
      onOpenChange={(open) => !open && onClose()}
      contentRef={menuRef}
      position={{ x: position.left, y: position.top }}
      mobile={mobileSheet}
      mobileHeight="82vh"
      className={
        mobileSheet
          ? 'add-library-surface add-library-node-menu nadd-surface add-library-mobile nadd-mobile'
          : 'add-library-surface add-library-node-menu nadd-surface'
      }
      style={mobileSheet ? undefined : { width: MENU_W }}
      title="Add node"
      description="Search nodes, sources, effects, and utilities to add to the graph."
      onEscapeKeyDown={preserveScopedAddLibraryEscape}
    >
      {content}
    </EditorOverlayFrame>
  );
}
