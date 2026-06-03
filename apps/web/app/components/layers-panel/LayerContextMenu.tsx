import type { GraphArea } from '../../types/config';
import { FloatingMenu } from '../ui/floating-menu';

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
      className="layer-context-menu"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      role="menu"
    >
      <button type="button" role="menuitem" onClick={() => onCreateAreaFromSelection(contextMenu.ids)}>
        Create area
      </button>
      {graphAreas.map((area) => (
        <button
          key={area.id}
          type="button"
          role="menuitem"
          onClick={() => onAddSelectionToArea(area.id, contextMenu.ids)}
        >
          <span className="layer-area-dot" style={{ background: area.color }} aria-hidden="true" />
          Add to {area.name}
        </button>
      ))}
      {contextMenu.ids.some(hasAreaMembership) && (
        <button type="button" role="menuitem" onClick={() => onRemoveSelectionFromAreas(contextMenu.ids)}>
          Remove from area
        </button>
      )}
    </FloatingMenu>
  );
}
