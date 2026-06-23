import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { EffectPreset, LayerKind } from '../../types/config';
import type { ArrayPresetId } from '../../utils/arrayPresets';
import type { NoisePresetId } from '../../utils/noisePresets';
import type { TextPresetId } from '../../utils/textPresets';
import { AddLibraryPanel } from '../add-library/AddLibraryPanel';
import type { AddLibraryAction } from '../add-library/addLibraryModel';
import { useAddLibraryFloatingMenu } from '../add-library/useAddLibraryFloatingMenu';

const LAYER_ADD_MENU_W = 540;
const LAYER_ADD_MENU_H = 560;
type LayerAddActionHandler = (action: AddLibraryAction) => void;

export function LayerAddMenu({
  onAddLayer,
  onAddEffectPreset,
  onAddTextPreset,
  onAddNoisePreset,
  onAddArrayPreset,
  onAddScene3D,
  onStartAiImage,
}: {
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
  onAddTextPreset: (preset: TextPresetId) => void;
  onAddNoisePreset: (preset: NoisePresetId) => void;
  onAddArrayPreset: (preset: ArrayPresetId) => void;
  onAddScene3D: () => void;
  onStartAiImage?: () => void;
}) {
  const {
    anchorRef: addMenuAnchorRef,
    close: closeAddMenu,
    menuRef: addMenuRef,
    menuStyle: addMenuStyle,
    open: isAddMenuOpen,
    toggle: toggleAddMenu,
  } = useAddLibraryFloatingMenu({ width: LAYER_ADD_MENU_W, height: LAYER_ADD_MENU_H });

  const handleAddLayer = useCallback(
    (kind: Exclude<LayerKind, 'effect'>) => {
      onAddLayer(kind);
      closeAddMenu();
    },
    [closeAddMenu, onAddLayer],
  );

  const handleAddEffectPreset = useCallback(
    (preset: EffectPreset) => {
      onAddEffectPreset(preset);
      closeAddMenu();
    },
    [closeAddMenu, onAddEffectPreset],
  );

  const handleAddTextPreset = useCallback(
    (preset: TextPresetId) => {
      onAddTextPreset(preset);
      closeAddMenu();
    },
    [closeAddMenu, onAddTextPreset],
  );

  const handleAddNoisePreset = useCallback(
    (preset: NoisePresetId) => {
      onAddNoisePreset(preset);
      closeAddMenu();
    },
    [closeAddMenu, onAddNoisePreset],
  );

  const handleAddArrayPreset = useCallback(
    (preset: ArrayPresetId) => {
      onAddArrayPreset(preset);
      closeAddMenu();
    },
    [closeAddMenu, onAddArrayPreset],
  );

  const handleStartAiImage = useCallback(() => {
    onStartAiImage?.();
    closeAddMenu();
  }, [closeAddMenu, onStartAiImage]);

  const handleAddScene3D = useCallback(() => {
    onAddScene3D();
    closeAddMenu();
  }, [closeAddMenu, onAddScene3D]);

  const handleAddLibraryAction = useCallback(
    (action: AddLibraryAction) => {
      const handlers: Partial<Record<AddLibraryAction['kind'], LayerAddActionHandler>> = {
        layer: (item) => handleAddLayer((item as Extract<AddLibraryAction, { kind: 'layer' }>).layerKind),
        textPreset: (item) => handleAddTextPreset((item as Extract<AddLibraryAction, { kind: 'textPreset' }>).preset),
        noisePreset: (item) =>
          handleAddNoisePreset((item as Extract<AddLibraryAction, { kind: 'noisePreset' }>).preset),
        arrayPreset: (item) =>
          handleAddArrayPreset((item as Extract<AddLibraryAction, { kind: 'arrayPreset' }>).preset),
        aiImage: () => handleStartAiImage(),
        effect: (item) => handleAddEffectPreset((item as Extract<AddLibraryAction, { kind: 'effect' }>).preset),
        scene3d: () => handleAddScene3D(),
      };
      handlers[action.kind]?.(action);
    },
    [
      handleAddArrayPreset,
      handleAddEffectPreset,
      handleAddLayer,
      handleAddNoisePreset,
      handleAddTextPreset,
      handleAddScene3D,
      handleStartAiImage,
    ],
  );

  return (
    <div ref={addMenuAnchorRef} className="relative">
      <button className="layer-add-button" onClick={toggleAddMenu} aria-label="Add layer">
        + ADD
      </button>
      {isAddMenuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div ref={addMenuRef} className="add-library-surface add-library-layer-menu" style={addMenuStyle}>
            <AddLibraryPanel
              surface="layers"
              searchLabel="Search layers and effects"
              placeholder="Add layer…"
              onAdd={handleAddLibraryAction}
              onClose={closeAddMenu}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
