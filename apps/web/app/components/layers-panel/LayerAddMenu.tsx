import { useCallback, useState } from 'react';
import type { EffectPreset, LayerKind } from '../../types/config';
import type { ArrayPresetId } from '../../utils/arrayPresets';
import type { NoisePresetId } from '../../utils/noisePresets';
import type { TextPresetId } from '../../utils/textPresets';
import { AddLibraryPanel } from '../add-library/AddLibraryPanel';
import { preserveScopedAddLibraryEscape } from '../add-library/addLibraryEscape';
import type { AddLibraryAction } from '../add-library/addLibraryModel';
import { useAddLibraryMobileSheet } from '../add-library/useAddLibraryMobileSheet';
import { EditorOverlayFrame } from '../editor-workflow/EditorOverlayFrame';

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
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const mobileSheet = useAddLibraryMobileSheet();
  const closeAddMenu = useCallback(() => setIsAddMenuOpen(false), []);

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

  const trigger = (
    <button type="button" className="layer-add-button" aria-label="Add layer">
      + ADD
    </button>
  );
  const content = (
    <AddLibraryPanel
      surface="layers"
      searchLabel="Search layers and effects"
      placeholder="Add layer…"
      onAdd={handleAddLibraryAction}
      onClose={closeAddMenu}
    />
  );

  return (
    <EditorOverlayFrame
      open={isAddMenuOpen}
      onOpenChange={setIsAddMenuOpen}
      onEscapeKeyDown={preserveScopedAddLibraryEscape}
      mobile={mobileSheet}
      mobileHeight="78vh"
      title="Add layer"
      description="Search layers, sources, and effects to add to the composition."
      className={`add-library-surface add-library-layer-menu${mobileSheet ? ' add-library-mobile' : ''}`}
      trigger={trigger}
    >
      {content}
    </EditorOverlayFrame>
  );
}
