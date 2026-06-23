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
  const addMenu = useAddLibraryFloatingMenu({ width: LAYER_ADD_MENU_W, height: LAYER_ADD_MENU_H });

  const handleAddLayer = useCallback(
    (kind: Exclude<LayerKind, 'effect'>) => {
      onAddLayer(kind);
      addMenu.close();
    },
    [addMenu.close, onAddLayer],
  );

  const handleAddEffectPreset = useCallback(
    (preset: EffectPreset) => {
      onAddEffectPreset(preset);
      addMenu.close();
    },
    [addMenu.close, onAddEffectPreset],
  );

  const handleAddTextPreset = useCallback(
    (preset: TextPresetId) => {
      onAddTextPreset(preset);
      addMenu.close();
    },
    [addMenu.close, onAddTextPreset],
  );

  const handleAddNoisePreset = useCallback(
    (preset: NoisePresetId) => {
      onAddNoisePreset(preset);
      addMenu.close();
    },
    [addMenu.close, onAddNoisePreset],
  );

  const handleAddArrayPreset = useCallback(
    (preset: ArrayPresetId) => {
      onAddArrayPreset(preset);
      addMenu.close();
    },
    [addMenu.close, onAddArrayPreset],
  );

  const handleStartAiImage = useCallback(() => {
    onStartAiImage?.();
    addMenu.close();
  }, [addMenu.close, onStartAiImage]);

  const handleAddScene3D = useCallback(() => {
    onAddScene3D();
    setShowAddMenu(false);
  }, [onAddScene3D]);

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
    <div ref={addMenu.anchorRef} className="relative">
      <button className="layer-add-button" onClick={addMenu.toggle} aria-label="Add layer">
        + ADD
      </button>
      {addMenu.open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div ref={addMenu.menuRef} className="add-library-surface add-library-layer-menu" style={addMenu.menuStyle}>
            <AddLibraryPanel
              surface="layers"
              searchLabel="Search layers and effects"
              placeholder="Add layer…"
              onAdd={handleAddLibraryAction}
              onClose={addMenu.close}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
