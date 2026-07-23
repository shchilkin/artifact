import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from 'react';
import type { GraphArea, Layer } from '../../types/config';
import { EditorOverlayFrame } from '../editor-workflow/EditorOverlayFrame';
import { clampPopupPosition } from '../node-canvas/helpers';
import { MenuDivider, MenuItem } from '../ui/MenuItem';

export interface LayerContextMenuState {
  x: number;
  y: number;
  ids: string[];
  returnFocusTarget: HTMLElement | null;
}

export function LayerContextMenu({
  contextMenu,
  graphAreas,
  hasAreaMembership,
  layers,
  onClose,
  onDuplicateLayers,
  onRemoveLayers,
  onCreateAreaFromSelection,
  onAddSelectionToArea,
  onRemoveSelectionFromAreas,
  onRenameLayer,
  onSetLayersVisible,
}: {
  contextMenu: LayerContextMenuState | null;
  graphAreas: GraphArea[];
  hasAreaMembership: (id: string) => boolean;
  layers: Layer[];
  onClose: () => void;
  onDuplicateLayers: (ids: string[]) => void;
  onRemoveLayers: (ids: string[]) => void;
  onCreateAreaFromSelection: (ids: string[]) => void;
  onAddSelectionToArea: (areaId: string, ids: string[]) => void;
  onRemoveSelectionFromAreas: (ids: string[]) => void;
  onRenameLayer: (id: string) => void;
  onSetLayersVisible: (ids: string[], visible: boolean) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(true);
  const menuX = contextMenu?.x;
  const menuY = contextMenu?.y;

  useEffect(() => {
    if (menuX === undefined || menuY === undefined) return;
    restoreFocusRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [menuX, menuY]);

  if (!contextMenu) return null;
  const selectedLayers = selectedContextLayers(contextMenu.ids, layers);
  const singleLayer = selectedLayers.length === 1 ? selectedLayers[0] : null;
  const allVisible = selectedLayers.length > 0 && selectedLayers.every((layer) => layer.visible);
  const deletableIds = selectedLayers.filter((layer) => !layer.locked).map((layer) => layer.id);
  const hasSelectedAreaMembership = contextMenu.ids.some(hasAreaMembership);
  const menuWidth = 196;
  const menuHeight = 16 + layerContextMenuItemCount(singleLayer, graphAreas.length, hasSelectedAreaMembership) * 46;
  const menuPosition = clampPopupPosition(contextMenu.x, contextMenu.y, menuWidth, menuHeight);
  const close = (restoreFocus: boolean) => {
    onClose();
    if (restoreFocus && contextMenu.returnFocusTarget?.isConnected) {
      queueMicrotask(() => contextMenu.returnFocusTarget?.focus());
    }
  };

  const run = (action: () => void, restoreFocus = true) => {
    action();
    onClose();
    if (restoreFocus && contextMenu.returnFocusTarget?.isConnected) {
      queueMicrotask(() => contextMenu.returnFocusTarget?.focus());
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const activeIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowUp'
            ? (activeIndex - 1 + items.length) % items.length
            : (activeIndex + 1) % items.length;
    items[nextIndex]?.focus();
  };

  return (
    <EditorOverlayFrame
      variant="floating"
      open
      onOpenChange={(open) => {
        if (!open) close(restoreFocusRef.current);
      }}
      contentRef={menuRef}
      position={{ x: menuPosition.left, y: menuPosition.top }}
      className="artifact-menu layer-context-menu"
      style={{ width: menuWidth, padding: '4px 0' }}
      title="Layer actions"
      description="Edit the selected layers or organize them in an area."
      onEscapeKeyDown={() => {
        restoreFocusRef.current = true;
      }}
      onPointerDownOutside={() => {
        restoreFocusRef.current = false;
      }}
      onKeyDown={handleMenuKeyDown}
      role="menu"
    >
      <LayerEditMenuItems
        allVisible={allVisible}
        deletableIds={deletableIds}
        ids={contextMenu.ids}
        onDuplicateLayers={onDuplicateLayers}
        onRemoveLayers={onRemoveLayers}
        onRenameLayer={onRenameLayer}
        onRun={run}
        onSetLayersVisible={onSetLayersVisible}
        singleLayer={singleLayer}
      />
      <MenuDivider />
      <LayerAreaMenuItems
        graphAreas={graphAreas}
        hasSelectedAreaMembership={hasSelectedAreaMembership}
        ids={contextMenu.ids}
        onAddSelectionToArea={onAddSelectionToArea}
        onCreateAreaFromSelection={onCreateAreaFromSelection}
        onRemoveSelectionFromAreas={onRemoveSelectionFromAreas}
        onRun={run}
      />
    </EditorOverlayFrame>
  );
}

function selectedContextLayers(ids: string[], layers: Layer[]) {
  return ids.map((id) => layers.find((layer) => layer.id === id)).filter((layer): layer is Layer => Boolean(layer));
}

function layerContextMenuItemCount(singleLayer: Layer | null, areaCount: number, hasSelectedAreaMembership: boolean) {
  return (singleLayer ? 1 : 0) + 4 + areaCount + (hasSelectedAreaMembership ? 1 : 0);
}

function LayerEditMenuItems({
  allVisible,
  deletableIds,
  ids,
  onDuplicateLayers,
  onRemoveLayers,
  onRenameLayer,
  onRun,
  onSetLayersVisible,
  singleLayer,
}: {
  allVisible: boolean;
  deletableIds: string[];
  ids: string[];
  onDuplicateLayers: (ids: string[]) => void;
  onRemoveLayers: (ids: string[]) => void;
  onRenameLayer: (id: string) => void;
  onRun: (action: () => void, restoreFocus?: boolean) => void;
  onSetLayersVisible: (ids: string[], visible: boolean) => void;
  singleLayer: Layer | null;
}) {
  return (
    <>
      {singleLayer && (
        <MenuItem role="menuitem" label="Rename" onClick={() => onRun(() => onRenameLayer(singleLayer.id), false)} />
      )}
      <MenuItem
        role="menuitem"
        label={allVisible ? 'Hide' : 'Show'}
        onClick={() => onRun(() => onSetLayersVisible(ids, !allVisible))}
      />
      <MenuItem role="menuitem" label="Duplicate" onClick={() => onRun(() => onDuplicateLayers(ids))} />
      <MenuItem
        role="menuitem"
        label={deletableIds.length === 0 ? 'Delete locked' : 'Delete'}
        variant="danger"
        disabled={deletableIds.length === 0}
        onClick={() => onRun(() => onRemoveLayers(deletableIds))}
      />
    </>
  );
}

function LayerAreaMenuItems({
  graphAreas,
  hasSelectedAreaMembership,
  ids,
  onAddSelectionToArea,
  onCreateAreaFromSelection,
  onRemoveSelectionFromAreas,
  onRun,
}: {
  graphAreas: GraphArea[];
  hasSelectedAreaMembership: boolean;
  ids: string[];
  onAddSelectionToArea: (areaId: string, ids: string[]) => void;
  onCreateAreaFromSelection: (ids: string[]) => void;
  onRemoveSelectionFromAreas: (ids: string[]) => void;
  onRun: (action: () => void) => void;
}) {
  return (
    <>
      <MenuItem role="menuitem" label="Create area" onClick={() => onRun(() => onCreateAreaFromSelection(ids))} />
      {graphAreas.map((area) => (
        <MenuItem
          key={area.id}
          role="menuitem"
          icon={<span className="layer-area-dot" style={{ background: area.color }} aria-hidden="true" />}
          label={`Add to ${area.name}`}
          onClick={() => onRun(() => onAddSelectionToArea(area.id, ids))}
        />
      ))}
      {hasSelectedAreaMembership && (
        <MenuItem
          role="menuitem"
          label="Remove from area"
          onClick={() => onRun(() => onRemoveSelectionFromAreas(ids))}
        />
      )}
    </>
  );
}
