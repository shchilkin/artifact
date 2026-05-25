import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EffectPreset, LayerKind } from '../../types/config';
import type { TextPresetId } from '../../utils/textPresets';
import { AddLibraryPanel } from '../add-library/AddLibraryPanel';
import type { AddLibraryAction } from '../add-library/addLibraryModel';
import { clampPopupPosition } from '../node-canvas/helpers';

export type LayerInsertAction =
  | { kind: 'layer'; layerKind: Exclude<LayerKind, 'effect'> }
  | { kind: 'textPreset'; preset: TextPresetId }
  | { kind: 'effect'; preset: EffectPreset };

const LAYER_QUICK_MENU_W = 520;
const LAYER_QUICK_MENU_H = 520;

export function LayerQuickAddMenu({
  layerName,
  onInsert,
}: {
  layerName: string;
  onInsert: (action: LayerInsertAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const toggleMenu = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    const position = rect
      ? clampPopupPosition(rect.left, rect.bottom + 4, LAYER_QUICK_MENU_W, LAYER_QUICK_MENU_H)
      : { left: 8, top: 8 };
    setMenuPosition(position);
    setOpen((value) => !value);
  }, []);

  const handleInsert = useCallback(
    (action: LayerInsertAction) => {
      onInsert(action);
      setOpen(false);
    },
    [onInsert],
  );

  const handleAddLibraryAction = useCallback(
    (action: AddLibraryAction) => {
      if (action.kind === 'layer') handleInsert({ kind: 'layer', layerKind: action.layerKind });
      if (action.kind === 'textPreset') handleInsert({ kind: 'textPreset', preset: action.preset });
      if (action.kind === 'effect') handleInsert({ kind: 'effect', preset: action.preset });
    },
    [handleInsert],
  );

  return (
    <div ref={rootRef} className="layer-row-quick-add">
      <button
        type="button"
        className="layer-row-action"
        onClick={(event) => {
          event.stopPropagation();
          toggleMenu();
        }}
        aria-label={`Insert layer above ${layerName}`}
        title="Add above"
      >
        +
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="add-library-surface add-library-layer-quick-menu"
            style={{ left: menuPosition.left, top: menuPosition.top } as CSSProperties}
            onClick={(event) => event.stopPropagation()}
          >
            <AddLibraryPanel
              surface="layers"
              searchLabel={`Search inserts above ${layerName}`}
              placeholder="Insert above…"
              onAdd={handleAddLibraryAction}
              onClose={() => setOpen(false)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
