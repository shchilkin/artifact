import { type MutableRefObject, useCallback, useState } from 'react';
import type { CanvasDocument } from '../types/config';
import { type Preset, usePresets } from './usePresets';

interface UseGeneratorPresetsControllerOptions {
  docRef: MutableRefObject<CanvasDocument>;
  imageCache: Map<string, HTMLImageElement>;
  onLoadDocument: (doc: CanvasDocument) => void;
}

export function useEditorPresetsController({
  docRef,
  imageCache,
  onLoadDocument,
}: UseGeneratorPresetsControllerOptions) {
  const [showPresets, setShowPresets] = useState(false);
  const { presets, savePreset, deletePreset, loadPreset } = usePresets();

  const handleLoadPreset = useCallback(
    (preset: Preset) => {
      const { doc } = loadPreset(preset);
      onLoadDocument(doc);
      setShowPresets(false);
    },
    [loadPreset, onLoadDocument],
  );

  return {
    showPresets,
    presets,
    togglePresets: () => setShowPresets((current) => !current),
    closePresets: () => setShowPresets(false),
    handleLoadPreset,
    saveCurrentPreset: (name: string) => savePreset(name, docRef.current, imageCache),
    deletePreset,
  };
}
