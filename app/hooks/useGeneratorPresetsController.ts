import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import type { CanvasDocument } from '../types/config';
import { usePresets, type Preset } from './usePresets';

interface UseGeneratorPresetsControllerOptions {
  docRef: MutableRefObject<CanvasDocument>;
  imageCache: Map<string, HTMLImageElement>;
  onLoadDocument: (doc: CanvasDocument) => void;
}

export function useGeneratorPresetsController({
  docRef,
  imageCache,
  onLoadDocument,
}: UseGeneratorPresetsControllerOptions) {
  const [showPresets, setShowPresets] = useState(false);
  const { presets, savePreset, deletePreset, loadPreset } = usePresets();

  const handleLoadPreset = useCallback((preset: Preset) => {
    const { doc } = loadPreset(preset);
    onLoadDocument(doc);
    setShowPresets(false);
  }, [loadPreset, onLoadDocument]);

  useEffect(() => {
    if (!showPresets) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowPresets(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showPresets]);

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
