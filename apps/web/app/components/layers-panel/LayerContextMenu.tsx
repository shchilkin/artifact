import type { GraphArea } from '../../types/config';
import { FloatingMenu } from '../ui/floating-menu';
import { MenuItem } from '../ui/MenuItem';

export interface LayerContextMenuState {
  x: number;
  y: number;
  ids: string[];
}

export function LayerContextMenu({
  contextMenu,
  graphAreas,
  hasAreaMembership,
  onClose,
  onCreateAreaFromSelection,
  onAddSelectionToArea,
  onRemoveSelectionFromAreas,
}: {
  contextMenu: LayerContextMenuState | null;
  graphAreas: GraphArea[];
  hasAreaMembership: (id: string) => boolean;
  onClose: () => void;
  onCreateAreaFromSelection: (ids: string[]) => void;
  onAddSelectionToArea: (areaId: string, ids: string[]) => void;
  onRemoveSelectionFromAreas: (ids: string[]) => void;
}) {
  if (!contextMenu) return null;

  return (
    <FloatingMenu
      x={contextMenu.x}
      y={contextMenu.y}
      className="artifact-menu layer-context-menu"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      role="menu"
    >
      <MenuItem role="menuitem" label="Create area" onClick={() => onCreateAreaFromSelection(contextMenu.ids)} />
      {graphAreas.map((area) => (
        <MenuItem
          key={area.id}
          role="menuitem"
          icon={<span className="layer-area-dot" style={{ background: area.color }} aria-hidden="true" />}
          label={`Add to ${area.name}`}
          onClick={() => onAddSelectionToArea(area.id, contextMenu.ids)}
        />
      ))}
      {contextMenu.ids.some(hasAreaMembership) && (
        <MenuItem
          role="menuitem"
          label="Remove from area"
          onClick={() => onRemoveSelectionFromAreas(contextMenu.ids)}
        />
      )}
    </FloatingMenu>
  );
}
