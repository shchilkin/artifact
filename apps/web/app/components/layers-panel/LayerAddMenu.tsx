import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EffectPreset, LayerKind } from '../../types/config';
import type { TextPresetId } from '../../utils/textPresets';
import { AddLibraryPanel } from '../add-library/AddLibraryPanel';
import type { AddLibraryAction } from '../add-library/addLibraryModel';
import { clampPopupPosition } from '../node-canvas/helpers';

const LAYER_ADD_MENU_W = 540;
const LAYER_ADD_MENU_H = 560;

export function LayerAddMenu({
  onAddLayer,
  onAddEffectPreset,
  onAddTextPreset,
}: {
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
  onAddTextPreset: (preset: TextPresetId) => void;
}) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addButtonRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });

  useEffect(() => {
    if (!showAddMenu) return;
    function handleOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (addButtonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setShowAddMenu(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showAddMenu]);

  const openMenu = useCallback(() => {
    const rect = addButtonRef.current?.getBoundingClientRect();
    const position = rect
      ? clampPopupPosition(rect.left, rect.bottom + 4, LAYER_ADD_MENU_W, LAYER_ADD_MENU_H)
      : { left: 8, top: 8 };
    setMenuPosition(position);
    setShowAddMenu((prev) => !prev);
  }, []);

  const handleAddLayer = useCallback(
    (kind: Exclude<LayerKind, 'effect'>) => {
      onAddLayer(kind);
      setShowAddMenu(false);
    },
    [onAddLayer],
  );

  const handleAddEffectPreset = useCallback(
    (preset: EffectPreset) => {
      onAddEffectPreset(preset);
      setShowAddMenu(false);
    },
    [onAddEffectPreset],
  );

  const handleAddTextPreset = useCallback(
    (preset: TextPresetId) => {
      onAddTextPreset(preset);
      setShowAddMenu(false);
    },
    [onAddTextPreset],
  );

  const handleAddLibraryAction = useCallback(
    (action: AddLibraryAction) => {
      if (action.kind === 'layer') handleAddLayer(action.layerKind);
      if (action.kind === 'textPreset') handleAddTextPreset(action.preset);
      if (action.kind === 'effect') handleAddEffectPreset(action.preset);
    },
    [handleAddEffectPreset, handleAddLayer, handleAddTextPreset],
  );

  return (
    <div ref={addButtonRef} className="relative">
      <button className="layer-add-button" onClick={openMenu} aria-label="Add layer">
        + ADD
      </button>
      {showAddMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="add-library-surface add-library-layer-menu"
            style={{ left: menuPosition.left, top: menuPosition.top } as CSSProperties}
          >
            <AddLibraryPanel
              surface="layers"
              searchLabel="Search layers and effects"
              placeholder="Add layer…"
              onAdd={handleAddLibraryAction}
              onClose={() => setShowAddMenu(false)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
