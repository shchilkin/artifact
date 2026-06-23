import type { GraphArea, Layer } from '../../types/config';
import { FloatingMenu } from '../ui/floating-menu';
import { MenuDivider, MenuItem } from '../ui/MenuItem';

export interface LayerContextMenuState {
  x: number;
  y: number;
  ids: string[];
}

function clampLayerMenuPosition(x: number, y: number, width: number, height: number, padding = 8) {
  if (typeof window === 'undefined') return { left: x, top: y };
  return {
    left: Math.min(Math.max(padding, x), Math.max(padding, window.innerWidth - width - padding)),
    top: Math.min(Math.max(padding, y), Math.max(padding, window.innerHeight - height - padding)),
  };
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
  if (!contextMenu) return null;
  const selectedLayers = contextMenu.ids
    .map((id) => layers.find((layer) => layer.id === id))
    .filter((layer): layer is Layer => Boolean(layer));
  const singleLayer = selectedLayers.length === 1 ? selectedLayers[0] : null;
  const allVisible = selectedLayers.length > 0 && selectedLayers.every((layer) => layer.visible);
  const deletableIds = selectedLayers.filter((layer) => !layer.locked).map((layer) => layer.id);
  const menuWidth = 196;
  const menuItemCount =
    (singleLayer ? 1 : 0) + 4 + graphAreas.length + (contextMenu.ids.some(hasAreaMembership) ? 1 : 0);
  const menuPosition = clampLayerMenuPosition(contextMenu.x, contextMenu.y, menuWidth, 16 + menuItemCount * 46);

  const run = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <FloatingMenu
      x={menuPosition.left}
      y={menuPosition.top}
      className="artifact-menu layer-context-menu"
      style={{ width: menuWidth, padding: '4px 0' }}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      role="menu"
    >
      {singleLayer && (
        <MenuItem role="menuitem" label="Rename" onClick={() => run(() => onRenameLayer(singleLayer.id))} />
      )}
      <MenuItem
        role="menuitem"
        label={allVisible ? 'Hide' : 'Show'}
        onClick={() => run(() => onSetLayersVisible(contextMenu.ids, !allVisible))}
      />
      <MenuItem role="menuitem" label="Duplicate" onClick={() => run(() => onDuplicateLayers(contextMenu.ids))} />
      <MenuItem
        role="menuitem"
        label={deletableIds.length === 0 ? 'Delete locked' : 'Delete'}
        variant="danger"
        disabled={deletableIds.length === 0}
        onClick={() => run(() => onRemoveLayers(deletableIds))}
      />
      <MenuDivider />
      <MenuItem
        role="menuitem"
        label="Create area"
        onClick={() => run(() => onCreateAreaFromSelection(contextMenu.ids))}
      />
      {graphAreas.map((area) => (
        <MenuItem
          key={area.id}
          role="menuitem"
          icon={<span className="layer-area-dot" style={{ background: area.color }} aria-hidden="true" />}
          label={`Add to ${area.name}`}
          onClick={() => run(() => onAddSelectionToArea(area.id, contextMenu.ids))}
        />
      ))}
      {contextMenu.ids.some(hasAreaMembership) && (
        <MenuItem
          role="menuitem"
          label="Remove from area"
          onClick={() => run(() => onRemoveSelectionFromAreas(contextMenu.ids))}
        />
      )}
    </FloatingMenu>
  );
}
