import { useEffect } from 'react';
import type { GraphArea } from '../../types/config';

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
  useEffect(() => {
    if (!contextMenu) return;
    document.addEventListener('click', onClose);
    document.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('click', onClose);
      document.removeEventListener('scroll', onClose, true);
    };
  }, [contextMenu, onClose]);

  if (!contextMenu) return null;

  return (
    <div
      className="layer-context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={() => onCreateAreaFromSelection(contextMenu.ids)}>
        Create area
      </button>
      {graphAreas.map((area) => (
        <button key={area.id} type="button" onClick={() => onAddSelectionToArea(area.id, contextMenu.ids)}>
          <span className="layer-area-dot" style={{ background: area.color }} aria-hidden="true" />
          Add to {area.name}
        </button>
      ))}
      {contextMenu.ids.some(hasAreaMembership) && (
        <button type="button" onClick={() => onRemoveSelectionFromAreas(contextMenu.ids)}>
          Remove from area
        </button>
      )}
    </div>
  );
}
